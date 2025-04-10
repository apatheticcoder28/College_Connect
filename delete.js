const mongoose = require("mongoose");
const UserSchema = require("./models/User");
const User = mongoose.model("User", UserSchema);

mongoose.connect("mongodb://localhost:27017/AWP", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const deleteRecentUsers = async () => {
  try {
    // Get the reference user's creation date
    const referenceUser = await User.findOne({ 
      Email: "asmakhankafa@gmail.xs",
      FirstName: "Faisal",
      LastName: "Kham"
    });

    if (!referenceUser) {
      console.log("Reference user not found!");
      return;
    }

    // Delete all users created after the reference user
    const result = await User.deleteMany({
      _id: { $gt: referenceUser._id }
    });

    console.log(`Successfully deleted ${result.deletedCount} users created after your account!`);
  } catch (error) {
    console.error("Error deleting users:", error);
  } finally {
    mongoose.connection.close();
  }
};

deleteRecentUsers();