//Imports
const mongoose = require("mongoose");
const UserSchema = require("./User");
const User = mongoose.model("User",UserSchema);

//Schema
const PostSchema = new mongoose.Schema({
    Image: {
      type: String,
      required: false
    },
    Title: {
      type: String,
      required: true,
      trim: true
    },
    Caption: {
      type: String,
      required: true,
      trim: true
    },
    Tags: {
      type: String,
      required: true,
      trim: true
    },
    Location: {
      type: String,
      required: false,
      trim: true
    },
    OwnerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    comments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment'
    }]
  });


//Export
module.exports = PostSchema;
