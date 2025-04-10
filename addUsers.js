const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const UserSchema = require("./models/User");
const PostSchema = require("./models/Post");
const User = mongoose.model("User", UserSchema);
const Post = mongoose.model("Post", PostSchema);

mongoose.connect("mongodb://localhost:27017/AWP", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const seedData = async () => {
  try {
    // Create specific users from the image
    const users = [
      {
        FirstName: "Faisal",
        LastName: "Khan",
        Email: "faisal@example.com",
        Password: await bcrypt.hash("password123", 5),
        Role: "user",
        PhoneNumber: "9876543210",
        EnrollmentNumber: "BSC123456",
        department: "cs",
        year: 2,
        ProfileImg: "faisal.png",
        collegeName: "MKES",
        courseProgram: "Bsc",
      },
      {
        FirstName: "Anom",
        LastName: "Khan",
        Email: "anom@example.com",
        Password: await bcrypt.hash("password123", 5),
        Role: "user",
        PhoneNumber: "9876543211",
        EnrollmentNumber: "BSC123457",
        department: "cs",
        year: 2,
        ProfileImg: "anom.png",
        collegeName: "MKES",
        courseProgram: "Bsc",
      },
      // Add other users from the image similarly
    ];

    const createdUsers = await User.insertMany(users);

    // Create posts matching the image
    const posts = [
        {
          Title: "ertgfh",
          Caption: "ewrtfg",
          Image: "topography.png",
          OwnerID: createdUsers[1]._id, // Anom Khan's post
          Tags: ["wedrfb"]
        },
        {
          Title: "Photoshoot with my friends!!! :)",
          Caption: "Pose suggested by raihaan alba!!!",
          Image: "yellow-tshirt.png",
          OwnerID: createdUsers[0]._id, // Faisal Khan's post
          Tags: ["#Cool"]
        },
        {
          Title: "Rajjab Fatha :0",
          Caption: "Fatiha at my house!!! those who want can join now!!",
          Image: "food.png",
          OwnerID: createdUsers[0]._id, // Faisal Khan's post
          Tags: ["#Fatiha"]
        }
      ];

    await Post.insertMany(posts);
    console.log("Sample users and posts have been successfully added!");
  } catch (error) {
    console.error("Error seeding data:", error);
  } finally {
    mongoose.connection.close();
  }
};

seedData();