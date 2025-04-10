//Imports
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

//User Schema
const UserSchema = new mongoose.Schema({
  FirstName: {
    type: String,
    required: true,
  },
  LastName: {
    type: String,
    required: true,
  },
  Email: {
    type: String,
    lowercase: true,
    required: true,
    unique: true,
  },
  Password: {
    type: String,
    min: 8,
    required: true,
  },
  JoinedAt: {
    type: Date,
    required: true,
    immutable: true,
    default: () => Date.now(),
  },
  Posts: {
    type: [mongoose.SchemaTypes.ObjectId],
    required: false,
  },
  PhoneNumber: {
    type: String,
    required: function () {
      return this.Role !== 'admin'; // Required for non-admin users
    },
    match: /^[0-9]{10}$/,
    unique: true,
  },
  EnrollmentNumber: {
    type: String,
    required: function () {
      return this.Role !== 'admin'; // Required for non-admin users
    },
    unique: true,
  },
  ProfileImg: {
    type: String,
    default: "DefaultImg.png",
  },
  Notifications: {
    type: [mongoose.SchemaTypes.ObjectId],
    required: false,
  },
  collegeName: {
    type: String,
    default: 'MKES',
  },
  courseProgram: {
    type: String,
    default: 'BSc',
  },
  department: {
    type: String,
    enum: ['cs', 'it'],
    required: function () {
      return this.Role !== 'admin'; // Required for non-admin users
    },
  },
  year: {
    type: Number,
    required: function () {
      return this.Role !== 'admin'; // Required for non-admin users
    },
  },
  Role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  Cookie: {
    type: String,
    required: false,
  },
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Following',
    },
  ],
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Following',
    },
  ],
  status: {
    type: String,
    enum: ['active', 'banned', 'deleted'],
    default: 'active'
},
banInfo: {
    bannedAt: Date,
    bannedReason: String,
    bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
},
  AdminCookie: {
    type: String,
    default: null
  }
});

// Handle duplicate errors
UserSchema.post('save', function (error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    if (error.keyPattern.EnrollmentNumber) {
      next(new Error('This Enrollment Number is already registered.'));
    } else if (error.keyPattern.PhoneNumber) {
      next(new Error('This Phone Number is already registered.'));
    } else {
      next();
    }
  } else {
    next(error);
  }
});

//Virtuals
UserSchema.virtual("Username").get(function () {
  return this.FirstName + " " + this.LastName;
});

//MiddleWare
UserSchema.pre("save", async function () {
  // Name Formatting
  this.FirstName =
    this.FirstName.charAt(0).toUpperCase() +
    (this.FirstName.length > 1 ? this.FirstName.substr(1).toLowerCase() : "");
  this.LastName =
    this.LastName.charAt(0).toUpperCase() +
    (this.LastName.length > 1 ? this.LastName.substr(1).toLowerCase() : "");

  // Password Hashing
  this.Password = await bcrypt.hash(this.Password, 5);
});

//Schema Methods
UserSchema.methods.VerifyPassword = function (Password) {
  return bcrypt.compare(Password, this.Password);
};

UserSchema.methods.isBanned = function() {
  return this.status === 'banned';
};

// Add middleware to check ban status before login
UserSchema.pre('save', function(next) {
  if (this.status === 'banned') {
      const error = new Error('This account has been banned.');
      error.code = 'BANNED_ACCOUNT';
      return next(error);
  }
  next();
});

// Indexes for unique constraints
UserSchema.index({ EnrollmentNumber: 1 }, { unique: true });
UserSchema.index({ PhoneNumber: 1 }, { unique: true });

module.exports = UserSchema;
