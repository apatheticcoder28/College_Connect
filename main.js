var express = require('express');
var app = express();
var port = process.env.PORT||8080;
var morgan = require('morgan');
var mongoose = require('mongoose');
var router = express.Router();
var path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');

//importing database schemas
var UserSchema = require("./models/User");
var User = mongoose.model("User",UserSchema);
var PostSchema = require("./models/Post")
var Post = mongoose.model("Post",PostSchema);
const FollowingSchema = require('./models/Follow');
const Following = mongoose.model('Following', FollowingSchema, 'following');
const Poll = require('./models/Poll');
const Message = require('./models/Messages');
const Comment = require('./models/Comment');
const Notification = require("./models/Notification");
const BannedUser = require('./models/bannedUsers');
const Event = require('./models/Event');


//server
const server = app.listen(port, function(){
  console.log('Running server on port '+port);
});

//socket.io
const socketConnected = new Set();
const socketToUser = new Map(); // Map to associate socket IDs with user IDs
const userToSocket = new Map(); // Map to associate user IDs with socket IDs

const io = require('socket.io')(server);

io.on('connection', (socket) => {
  console.log("Connected Socket Id: " + socket.id);
  socketConnected.add(socket.id);
  io.emit('clients-total', socketConnected.size); // Emit the total number of connected clients

  // Register the user ID with the socket
  socket.on('register-user', (userId) => {
    socketToUser.set(socket.id, userId);  // Map socket ID to user ID
    userToSocket.set(userId, socket.id);  // Map user ID to socket ID
    console.log(`User ${userId} registered with socket ID ${socket.id}`);
  });

  // Handle incoming messages
  socket.on('message', async (data) => {
    const { fromUserId, toUserId, message, senderName } = data;
    
    try {
      // Save the message to MongoDB
      const newMessage = new Message({
        fromUserId,
        toUserId,
        message,
        timestamp: new Date()
      });
      await newMessage.save();
        // Notify the recipient if they're online
        const recipientSocketId = userToSocket.get(toUserId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('chat-msg', {
          fromUserId,
          message,
          senderName,
        });
        // Also emit a notification event
        io.to(recipientSocketId).emit('new-notification', {
          type: 'message',
          sender: senderName,
          message: `New message from ${senderName}`
        });
        console.log(`Message sent from ${fromUserId} to ${toUserId}`);
      } else {
        console.log(`User ${toUserId} is not connected.`);
      }
        // Create a notification for the recipient
        const notification = new Notification({
            recipient: toUserId,
            sender: fromUserId,
            type: 'message',
            message: `${senderName} sent you a message: "${message}"`,
            timestamp: new Date(),
            isRead: false,
        });
        await notification.save();
    } catch (error) {
        console.error('Error saving message or notification to database:', error);
    }
});

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log("Disconnected Socket Id: " + socket.id);

    const userId = socketToUser.get(socket.id);
    if (userId) {
      socketToUser.delete(socket.id);  // Remove the mapping of socket ID to user ID
      userToSocket.delete(userId);     // Remove the mapping of user ID to socket ID
    }

    socketConnected.delete(socket.id);  // Remove the socket ID from the connected set
    io.emit('clients-total', socketConnected.size); // Emit the updated total number of clients
  });
});



//cookie parser
var CookieParser = require("cookie-parser");
const { Console } = require('console');
var jwt = require('jsonwebtoken');

//Importing UserSchema Model
const { error } = require('console');
mongoose.connection.on("connected", () => {
  console.log("AWP Databse Connected");
});

//Express Session
const session = require('express-session');

//Express Flash
const flash = require('express-flash');

//Session
app.use(session({
  secret : "secret key",
  resave: false,
  saveUninitialized: true,
  cookie : {
    maxAge : 60000
  }
}));
app.use(flash());

//bodyParse
const bodyParser = require('body-parser');
const { Socket } = require('dgram');
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

//View Engine
app.set('view engine','ejs');

// logs request in terminal
app.use(morgan('dev')); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: false })); // decodes json data to text 
app.use(express.static(path.join(__dirname + '/website/templates')));
app.use(CookieParser());

//loading each folder from assets folder
app.use('/assets', express.static(path.join(__dirname, '/assets')));

// Add these static file serving configurations
app.use('/assets/img', express.static(path.join(__dirname, 'website/assets/img')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Update multer configuration
const uploadDir = path.join(__dirname, 'website', 'assets', 'img');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const filename = Date.now() + '-' + file.originalname;
        console.log('Saving image:', filename); // Debug log
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

async function connectToDatabase(){
    try{
      await mongoose.connect('mongodb://localhost:27017/AWP',{
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
      console.log('Connected Successfully');
    }catch(err){
      console.error(err);
    }
};
connectToDatabase();


//Functions 


//Date format function for Posts (posts.PostedAt)
function dateParser(rawDate){
  let dateObject = new Date(rawDate);
  let day = dateObject.getDate();
  let month = dateObject.getMonth() + 1;
  let year = dateObject.getFullYear(); 
  let daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let dayName = daysOfWeek[dateObject.getDay()];
  let formattedDatePosts = `${dayName} ${day}-${month}-${year}`;
  return formattedDatePosts;
}

//Function to show posted how many days ago
function formatPostDateAgo(postDate) {
  let postDateTime = new Date(postDate).getTime(); 
  let currentDateTime = new Date().getTime(); 
  let differenceInMs = currentDateTime - postDateTime;
  let differenceInDays = Math.floor(differenceInMs / (1000 * 60 * 60 * 24)); 
  return differenceInDays;
}

//Routes
app.get('/home', async (req, res) => {
  try {
    if (!req.cookies.auth) {
      res.redirect('/login');
      return;
    }

    const requser = await User.find({ Cookie: req.cookies.auth });
    const currentuser = requser[0];
    const user = {
      Username: currentuser.Username,
      ProfileImg: currentuser.ProfileImg,
      ID: currentuser._id,
      joinedPolls: currentuser.joinedPolls || []
    };

    // Pagination setup
    const pollsPerPage = 8; // Number of polls per page
    const currentPage = parseInt(req.query.page) || 1; // Current page from query params
    const skip = (currentPage - 1) * pollsPerPage;

    // Fetch polls with pagination
    const totalPolls = await Poll.countDocuments();
    const polls = await Poll.find()
      .populate({
        path: 'OwnerID',
        select: 'Username FirstName LastName ProfileImg Email department year'
      })
      .populate('participants')
      .sort({ createdAt: -1 })

    // Pagination helpers
    const hasNextPage = currentPage * pollsPerPage < totalPolls;
    const hasPrevPage = currentPage > 1;
    const totalPages = Math.ceil(totalPolls / pollsPerPage);

    const userposts = await Post.find({}).populate('OwnerID');
    const postsArray = [];
    for (const post of userposts) {
      if (post.Title) { // Ensure that the Title field exists
        const formattedPost = {
          Title: post.Title,
          Image: post.Image,
          Caption: post.Caption,
          Tags: post.Tags,
          Location: post.Location,
          Visibility: post.Visibility,
          PID: post._id,
          Date: formatPostDateAgo(post.createdAt),
          createdAt: post.createdAt, // Keep the original createdAt timestamp for sorting
          Username: post.OwnerID ? post.OwnerID.Username : 'Unknown',
          Department: post.OwnerID ? post.OwnerID.department : 'Unknown',
          Year: post.OwnerID ? post.OwnerID.year : 'Unknown',
          ProfileImg: post.OwnerID ? post.OwnerID.ProfileImg : 'default-profile.png'
        };
        postsArray.push(formattedPost);
      }
    }

    const userinfo = await User.find({});
    const usersArray = userinfo.map(user => ({
      FirstName: user.FirstName,
      LastName: user.LastName,
      ProfileImg: user.ProfileImg,
      Course: user.courseProgram,
      Department: user.department,
      Year: user.year,
      JoinedAt: user.JoinedAt,
      ID: user.id,
      Role: user.Role
    }));

    res.render(path.join(__dirname, './website/templates/index.ejs'), {
      user,
      posts: postsArray,
      suggested: usersArray,
      polls,
      hasPrevPage,
      hasNextPage,
      currentPage,
      totalPages,
      messages: req.flash()
    });
  } catch (error) {
    console.error('Error fetching home data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/login', function(req,res){
  res.render(path.join(__dirname+'/website/templates/loginPage.ejs'),{ messages: req.flash() });
});

app.get('/chat', async (req,res) => {
  try {
    if (!req.cookies.auth) {
      res.redirect('/login');
      return;
    }

    // Find the current user
    const requser = await User.find({ Cookie: req.cookies.auth });
    const currentuser = requser[0];
    const user = {
      Username: currentuser.Username,
      ProfileImg: currentuser.ProfileImg,
      UserId: currentuser._id
    };

    const directChatUserId = req.query.userId;
    if (directChatUserId) {
      const directChatUser = await User.findById(directChatUserId);
      if (directChatUser) {
        user.directChat = {
          userId: directChatUser._id,
          username: directChatUser.Username,
          profileImg: directChatUser.ProfileImg,
          firstName: directChatUser.FirstName,
          lastName: directChatUser.LastName
        };
      }
    }

  // Find all posts
  const userposts = await Post.find({}).populate('OwnerID');
  const postsArray = [];
  for (const post of userposts) {
    if (post.Title) { // Ensure that the Title field exists
      const formattedPost = {
        Title: post.Title,
        Image: post.Image,
        Caption: post.Caption,
        Tags: post.Tags,
        Location: post.Location,
        Visibility: post.Visibility,
        PID: post._id,
        Date: formatPostDateAgo(post.createdAt),
        Username: post.OwnerID ? post.OwnerID.Username : 'Unknown',
        Department: post.OwnerID ? post.OwnerID.department : 'Unknown',
        Year: post.OwnerID ? post.OwnerID.year : 'Unknown', // Assuming User model has Username field
        ProfileImg: post.OwnerID ? post.OwnerID.ProfileImg : 'default-profile.png'// Use the correct date field
      };
      postsArray.push(formattedPost);
    }
  }

  //Find all users
  const userinfo = await User.find({});
  const usersArray = [];
  for (const user of userinfo) {
    const formattedUser = {
      FirstName: user.FirstName,
      LastName: user.LastName,
      ProfileImg: user.ProfileImg,
      Course: user.courseProgram,
      Department: user.department,
      Year: user.year,
      JoinedAt: user.JoinedAt,
      ID: user.id
    };

    usersArray.push(formattedUser);
  }

  const followersList = await Following.find({ followedUserId: currentuser._id })
      .populate('followerUserId', 'FirstName ProfileImg LastName')
      .exec();
    const followers = followersList.map(f => ({
      followerId: f.followerUserId._id,
      firstname: f.followerUserId.FirstName,
      lastname: f.followerUserId.LastName,
      profileImg: f.followerUserId.ProfileImg
    }));
    const followersCount = followers.length;

    // Get following list using the provided logic
    const followingList = await Following.find({ followerId: currentuser._id })
      .populate('followedId', 'FirstName ProfileImg LastName')
      .exec();
    const followingUsers = followingList.map(f => ({
      followedId: f.followedId._id,
      firstname: f.followedId.FirstName,
      lastname: f.followedId.LastName,
      profileImg: f.followedId.ProfileImg
    }));
    const followingCount = followingUsers.length;
    
    res.render(path.join(__dirname, './website/templates/chat.ejs'), {
      user: user,
      posts: postsArray,
      suggested: usersArray,
      followers: followers,
      following: followingUsers,
      followersCount: followersCount,
      followingCount: followingCount,
      messages: req.flash()
    });

  } catch (error) {
    console.log(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/api/messages', async (req, res) => {
  const { fromUserId, toUserId } = req.query;

  try {
    const messages = await Message.find({
      $or: [
        { fromUserId, toUserId },
        { fromUserId: toUserId, toUserId: fromUserId },
      ],
    }).sort({ timestamp: 1 }); // Sort by timestamp in ascending order

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/login', async (req,res) => {
try {
const { email, password } = req.body;
const user = await User.findOne({ Email : email });
if(!user){
  throw new Error("Email Does Not Exists");
}
const bannedUser = await BannedUser.findOne({ userID: user._id });
        if (bannedUser) {
            return res.render(path.join(__dirname, './website/templates/bannedUsers.ejs'), { 
                reason: bannedUser.reason,
                bannedAt: bannedUser.bannedAt
            });
        }
if(await user.VerifyPassword(password)) {
  if(res.status(201)){
    var myquery = { Email : email};
    function genRandonString(length) {
      var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      var charLength = chars.length;
      var result = '';
      for ( var i = 0; i < length; i++ ) {
         result += chars.charAt(Math.floor(Math.random() * charLength));
      }
      return result;
   }
    var ck = genRandonString(10);
   res.cookie('auth' , ck, {
    httpOnly : true,
  }); 
   await User.updateOne(myquery, {Cookie : ck});
    req.flash("Success", { message: "Logged In Successfully", timeout: 5000 } );
    res.redirect('/home');
  }else{
    throw new Error("WRONG Password");
  }
}
else{
  throw new Error("Incorrect Password");
}
}
catch(error){
req.flash("error" , error.message)
return res.redirect('/login');
} 
});

app.get('/logout', async (req,res) => {
  try {
  await User.findOneAndUpdate({Cookie : req.cookies.auth},{Cookie : null});
  await res.clearCookie('auth');
  await res.redirect('/');
}catch(error){
  res.send(error.message);
  }
});

app.get('/signup',function(req,res){
  res.render(path.join(__dirname+'/website/templates/signupPage.ejs'),{ messages: req.flash() });
});

app.post('/signup', upload.single('image'), async (req,res) => {
  try{
    const { firstname, lastname, email, password, phoneNumber, collegeName, courseProgram, department, yearOfStudy, enrollmentNumber } = req.body;
    const image = req.file ? `${req.file.filename}` : null;
    const existingUser = await User.findOne({
      $or: [
        { EnrollmentNumber: enrollmentNumber },
        { PhoneNumber: phoneNumber }
      ]
    });
    if (existingUser) {
      if (existingUser.EnrollmentNumber === enrollmentNumber) {
        req.flash('error', 'This Enrollment Number is already registered.');
      }
      if (existingUser.PhoneNumber === phoneNumber) {
        req.flash('error', 'This Phone Number is already registered.');
      }
      return res.redirect('/signup');
    }
    const data = new User ({
    FirstName: firstname,
    LastName: lastname,
    Email: email,
    Password: password,
    PhoneNumber: phoneNumber,
    ProfileImg : image,
    collegeName: collegeName,
    courseProgram: courseProgram,
    department: department,
    year: yearOfStudy,
    EnrollmentNumber: enrollmentNumber
  });
  await data.save();
  req.flash("Success", { message: "Account Created Successfully", timeout: 5000 } );
  res.redirect('/login');
}catch(error){
  console.error('Error creating post:', error);
  if(res.status(500)){
    if(error.code == 11000){
      req.flash("error" , "Account Already Registered with the Given Email"); 
    } else {
      req.flash("error" , "Phone Number Limit Exceeded"); 
    }
    return res.redirect('/signup');
  }
  
}
});

app.get('/profile', async (req, res) => {
  try {
      if (!req.cookies.auth) {
          return res.redirect('/login');
      }

      const currentuser = await User.findOne({ Cookie: req.cookies.auth });

      // Count followers and following
      const followersCount = await Following.countDocuments({ followedId: currentuser._id });
      const followingCount = await Following.countDocuments({ followerId: currentuser._id });

      // Get followers and following lists
      const followers = await Following.find({ followedId: currentuser._id })
          .populate('followerId', 'FirstName LastName ProfileImg')
          .lean();

      const following = await Following.find({ followerId: currentuser._id })
          .populate('followedId', 'FirstName LastName ProfileImg')
          .lean();

      // Get posts
      const posts = await Post.find({ OwnerID: currentuser._id })
    .populate('OwnerID')
    .lean();

    const postsWithComments = await Promise.all(posts.map(async (post) => {
      const comments = await Comment.find({ postId: post._id })
          .populate('userId', 'FirstName LastName ProfileImg')
          .lean();
      return { ...post, comments };
  }));

      // Get polls with populated participants
      const polls = await Poll.find({ OwnerID: currentuser._id })
          .populate({
              path: 'participants',
              select: 'Username ProfileImg department year Email FirstName LastName'
          })
          .populate('OwnerID')
          .lean();

      const user = {
          Username: currentuser.Username,
          ProfileImg: currentuser.ProfileImg,
          FirstName: currentuser.FirstName,
          LastName: currentuser.LastName,
          Email: currentuser.Email,
          PhoneNumber: currentuser.PhoneNumber,
          department: currentuser.department,
          year: currentuser.year,
          bio: currentuser.bio,
          ID: currentuser._id,
          followersCount: followersCount,
          followingCount: followingCount
      };

      res.render(path.join(__dirname, './website/templates/profilePage.ejs'), {
          user: user,
          posts: postsWithComments,
          polls: polls,
          followers: followers || [],
          following: following || [],
          messages: req.flash()
      });
  } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Server Error');
  }
});

app.post('/profile', upload.single('image'), async function (req,res){
  try{
    if (req.cookies.auth==null||req.cookies.auth==undefined){
      res.redirect('/login');
      return;
    }
    var requser = await User.find({Cookie : req.cookies.auth});
    var currentuser = requser[0];
    var user = ({
      Username: currentuser.Username,
      Email: currentuser.Email,
      Password: currentuser.Password,
      JoinedAt: dateParser(currentuser.JoinedAt),
      PhoneNumber : currentuser.PhoneNumber,
      ProfileImg: currentuser.ProfileImg,
      FirstName : currentuser.FirstName,
      LastName : currentuser.LastName,
      collegeName: currentuser.collegeName,
      courseProgram: currentuser.courseProgram,
      department: currentuser.department
    })

    var userpost = await Post.find({});
      var postsArray = [];
      for (let i = 0; i < userpost.length; i++) {
        var currentposts = userpost[i];
        if (currentposts.Model !== undefined) {
          var post = {
            Model: currentposts.Model,
            Img: currentposts.Img,
            Price: currentposts.Price,
            Location: currentposts.Location,
            Condition: currentposts.Condition,
            PID : currentposts._id,
            Date : formatPostDateAgo(currentposts.PostedAt)
          };
          postsArray.push(post);
        }
      }

    const { firstName, lastName, phone, email } = req.body;
    if(email == user.Email){
      console.log('no error');
    }
    else{
      var check = await User.findOne({Email:email});
      if(check === null){
        null;
      }
      else{
        throw new Error("Account Already Registered with the Given Email");
      }
    };
  const image = req.file ? `${req.file.filename}` : user.ProfileImg;
  await User.findOneAndUpdate({Cookie : req.cookies.auth},{
    ProfileImg: image,
    FirstName : firstName,
    LastName : lastName,
    PhoneNumber : phone,
    Email : email
  });
  req.flash("success", "Profile Edited Successfully");
  res.redirect('/profile');
  }catch(error){
    req.flash("error", error.message);
    res.redirect('/profile');
  }
});

app.get('/profileview/:id', async (req, res) => {
  try {
      if (!req.cookies.auth) {
          return res.redirect('/login');
      }

      const currentuser = await User.findOne({ Cookie: req.cookies.auth });
      const viewuser = await User.findById(req.params.id);

      if (!viewuser) {
          return res.status(404).send('User not found');
      }

      // Get followers and following counts
      const followersCount = await Following.countDocuments({ followedId: viewuser._id });
      const followingCount = await Following.countDocuments({ followerId: viewuser._id });

      // Get followers and following lists
      const followers = await Following.find({ followedId: viewuser._id })
          .populate('followerId', 'FirstName LastName year department ProfileImg')
          .lean();

      const following = await Following.find({ followerId: viewuser._id })
          .populate('followedId', 'FirstName LastName year department ProfileImg')
          .lean();

      // Get posts
      const posts = await Post.find({ OwnerID: viewuser._id }).lean();
const postsWithComments = await Promise.all(posts.map(async (post) => {
    const comments = await Comment.find({ postId: post._id })
        .populate('userId', 'FirstName LastName ProfileImg')
        .lean();
    return { ...post, comments };
}));

// Get polls with populated participants
let polls = await Poll.find({ OwnerID: viewuser._id })
    .populate('participants', 'Username ProfileImg')
    .lean();
    
// Ensure all polls have participants array initialized
polls = polls.map(poll => ({
    ...poll,
    participants: poll.participants || []
}));

// Merge posts and polls data with comments
const allPosts = [...postsWithComments, ...polls].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
);

      const user = {
          Username: viewuser.Username,
          ProfileImg: viewuser.ProfileImg,
          FirstName: viewuser.FirstName,
          LastName: viewuser.LastName,
          Email: viewuser.Email,
          PhoneNumber: viewuser.PhoneNumber,
          Department: viewuser.department,
          Year: viewuser.year,
          UID: viewuser._id,
          followersCount: followersCount,
          followingCount: followingCount
      };

      res.render(path.join(__dirname, './website/templates/leaserProfile.ejs'), {
          user: user,
          curuser: currentuser,
          post: allPosts,
          followers: followers || [],
          following: following || []
      });

  } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Server Error');
  }
});

app.get('/create-post', async (req, res) => {
  try{
    if (req.cookies.auth==null||req.cookies.auth==undefined){
      res.redirect('/login');
      return;
    }
    var requser = await User.find({Cookie : req.cookies.auth});
    var currentuser =requser[0];
    var user = ({
      Username: currentuser.Username,
      ProfileImg: currentuser.ProfileImg,
    })
      res.render(path.join(__dirname,'./website/templates/createPost.ejs'),{user:user, messages:req.flash()});
    }catch(error){
    console.log(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/create-post', upload.single('Image'), async (req, res) => {
  try {
    // Check for authentication cookie
    if (!req.cookies.auth) {
      return res.redirect('/login');
    }
    
    // Find the current user based on the auth cookie
    const Users = await User.find({ Cookie: req.cookies.auth });
    if (Users.length === 0) {
      console.error('User not found');
      return res.status(404).send('User not found');
    }

    const CurrentUser = Users[0];
    const OwnerID = CurrentUser.id;

    // Log request body and file for debugging
    console.log('Request Body:', req.body);
    console.log('File uploaded:', req.file);

    // Check if required fields are in the body
    const { Title, Caption, Tags, Location, Visibility } = req.body;
    if (!Title || !Caption || !Tags) {
      console.error('Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // Process image file if uploaded
    const image = req.file ? `${req.file.filename}` : null;

    // Create a new post object
    const newPost = new Post({
      Image: image,
      Title,
      Caption,
      Tags,
      Location,
      Visibility,
      OwnerID
    });

    // Save the new post
    await newPost.save();
    console.log('New post created:', newPost);

    // Add the post ID to the user's posts array
    const PostId = newPost.id;
    await User.findOneAndUpdate(
      { Cookie: req.cookies.auth },
      { $push: { Posts: PostId } }
    );
    console.log('Post added to user\'s posts array');

    // Flash success message
    req.flash("Success", { message: "Post Created Successfully!", timeout: 5000 });

    // Redirect to the home page
    res.redirect('/home');

  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/post/:pid', async function (req, res) {
  try {
    if (!req.cookies.auth) {
      res.redirect('/login');
      return;
    }

    const postId = req.params.pid;
    const postList = await Post.findById(postId);
    const UID = postList.OwnerID;
    const comments = await Comment.find({ postId })
      .populate('userId', 'FirstName LastName ProfileImg') // Populate user details
      .sort({ createdAt: -1 }); // Sort by newest first
  
    // Fetch user details of the post owner
    const Leaser = await User.findById(UID);

    // Fetch current user information for navbar
    const currentUser = await User.findOne({ Cookie: req.cookies.auth });
    const user = {
      Username: currentUser.Username,
      ProfileImg: currentUser.ProfileImg,
      Phone: currentUser.PhoneNumber,
      Email: currentUser.Email,
      UID: currentUser._id
    };
    
    // Construct the post object with new fields
    const post = {
      Username: Leaser.Username,
      UID: postList.OwnerID,
      ProfileImg: Leaser.ProfileImg,
      Image: postList.Image,
      Title: postList.Title,
      Caption: postList.Caption,
      Tags: postList.Tags,
      Location: postList.Location,
      Visibility: postList.Visibility,
      PostedAt: dateParser(postList.createdAt),
      Department: Leaser.department,
      Year: Leaser.year,
      id: postId,
      comments: comments.map(comment => ({
        text: comment.text,
        username: comment.userId.FirstName + " " + comment.userId.LastName,
        profileImg: comment.userId.ProfileImg,
        createdAt: dateParser(comment.createdAt)
      }))
    };

    if (!post) {
      res.status(404).send('Post not found');
      return;
    }

    res.render(path.join(__dirname, './website/templates/postview.ejs'), { post, user });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/post/:postId/comment', async (req, res) => {
  try {
    // Validate postId
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).send('Invalid post ID');
    }

    // Get the current user from cookie
    const currentUser = await User.findOne({ Cookie: req.cookies.auth });
    if (!currentUser) {
      return res.redirect('/login');
    }

    // Verify post exists
    const post = await Post.findById(req.params.postId).populate('OwnerID');
    if (!post) {
      return res.status(404).send('Post not found');
    }

    // Create new comment
    const newComment = new Comment({
      postId: req.params.postId,
      userId: currentUser._id,
      text: req.body.commentText
    });

    // Save the comment
    await newComment.save();
    console.log('Comment saved:', newComment);

    // Create notification for post owner if it's not their own comment
    if (post.OwnerID._id.toString() !== currentUser._id.toString()) {
      const notification = new Notification({
        recipient: post.OwnerID._id,
        sender: currentUser._id,
        type: 'comment',
        message: `commented on your post: "${req.body.commentText.substring(0, 30)}${req.body.commentText.length > 30 ? '...' : ''}"`,
        timestamp: new Date(),
        postId: post._id
      });
      await notification.save();
      console.log('Comment notification created:', notification);
    }

    // Redirect back to the post page
    res.redirect(`/post/${req.params.postId}`);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).send('Error adding comment');
  }
});

app.get('/', async function(req, res){
  res.render(path.join(__dirname, './website/templates/landingpage.ejs'));
});

app.delete('/post/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;
    const deletedPost = await Post.findByIdAndDelete(postId);
    if (!deletedPost) {
      req.flash("error", "Post not found"); 
      return res.status(404).redirect('/profile');
    }
    req.flash("success", "Post deleted successfully"); 
    res.send('/profile');
  } catch (error) {
    console.error('Error deleting post:', error);
    req.flash("error", "Internal Server Error"); 
    return res.status(500).redirect('/profile');
  }
});

app.get('/edit-post/:postId', async (req, res) => {
  try {
    if (!req.cookies.auth) {
      req.flash("Error", { message: "Please log in to edit a post", timeout: 5000 });
      res.redirect('/login');
      return;
    }
    const currentUser = await User.findOne({ Cookie: req.cookies.auth });
    if (!currentUser) {
      req.flash("Error", { message: "User not found. Please log in again.", timeout: 5000 });
      res.redirect('/login');
      return;
    }
    const post = await Post.findById(req.params.postId);
    if (!post) {
      req.flash("Error", { message: "Post not found", timeout: 5000 });
      
      return;
    }
    if (post.OwnerID.toString() !== currentUser.id.toString()) {
      req.flash("Error", { message: "You are not authorized to edit this post", timeout: 5000 });
     
      return;
    }
    res.render(path.join(__dirname,'./website/templates/editpost.ejs'),{ post: post, user: currentUser, messages: req.flash()});

  } catch (error) {
    console.error('Error rendering edit post form:', error);
    req.flash("Error", { message: "Internal Server Error", timeout: 5000 });
  }
});

app.post('/edit-post/:postId', upload.single('image'), async (req, res) => {
  try {
    if (!req.cookies.auth) {
      req.flash("Error", { message: "Please log in to edit a post", timeout: 5000 });
      res.redirect('/login');
      return;
    }
    const currentUser = await User.findOne({ Cookie: req.cookies.auth });
    if (!currentUser) {
      req.flash("Error", { message: "User not found. Please log in again.", timeout: 5000 });
      res.redirect('/login');
      return;
    }
    const post = await Post.findById(req.params.postId);
    if (!post) {
      req.flash("Error", { message: "Post not found", timeout: 5000 });
      return;
    }
    if (post.OwnerID.toString() !== currentUser.id.toString()) {
      req.flash("Error", { message: "You are not authorized to edit this post", timeout: 5000 });
      return;
    }
    const { Title, Caption, Tags, Location, Visibility} = req.body;
    const Img = req.file ? req.file.filename : post.Img;
    await Post.findByIdAndUpdate(req.params.postId, {
      Image: Img,
      Title, 
      Caption, 
      Tags, 
      Location, 
      Visibility
    });
    req.flash("Success", { message: "Post updated successfully!", timeout: 5000 });
    res.redirect('/home');

  } catch (error) {
    console.error('Error updating post:', error);
    req.flash("Error", { message: "Internal Server Error", timeout: 5000 });
  }
});

app.get('/search', async (req, res) => {
  try {
    if (!req.cookies.auth) {
      res.redirect('/login');
      return;
    }

    const currentUser = await User.findOne({ Cookie: req.cookies.auth });
    if (!currentUser) {
      res.redirect('/login');
      return;
    }

    const { query = '', department = '', year = '' } = req.query;
    let searchCriteria = { Role: { $ne: 'admin' } }; // Exclude admin users from search results

    // Search criteria for name or username
    if (query) {
      const queryParts = query.trim().split(" ");
      if (queryParts.length === 1) {
        searchCriteria.$or = [
          { FirstName: { $regex: new RegExp(queryParts[0], 'i') } },
          { LastName: { $regex: new RegExp(queryParts[0], 'i') } },
          { Username: { $regex: new RegExp(queryParts[0], 'i') } },
          { department: { $regex: new RegExp(queryParts[0], 'i') } },
        ];
      } else if (queryParts.length === 2) {
        searchCriteria.$and = [
          { FirstName: { $regex: new RegExp(queryParts[0], 'i') } },
          { LastName: { $regex: new RegExp(queryParts[1], 'i') } },
        ];
      }
    }

    // Add department filter if provided
    if (department) {
      searchCriteria.department = department;
    }

    // Add year filter if provided
    if (year) {
      searchCriteria.year = year;
    }

    // Get all unique departments and years for filter options
    const departments = await User.distinct('department', { Role: { $ne: 'admin' } });
    const years = await User.distinct('year', { Role: { $ne: 'admin' } });

    // Get users with follower and following counts
    const users = await User.find(searchCriteria).lean();
    const usersWithCounts = await Promise.all(users.map(async (user) => {
      const followersCount = await Following.countDocuments({ followedId: user._id });
      const followingCount = await Following.countDocuments({ followerId: user._id });
      return {
        ...user,
        followersCount,
        followingCount
      };
    }));

    res.render(path.join(__dirname, './website/templates/search.ejs'), {
      users: usersWithCounts,
      query: query || '',
      department: department || '',
      year: year || '',
      departments: departments || [],
      years: years || [],
      user: {
        ID: currentUser._id,
        Username: currentUser.Username,
        ProfileImg: currentUser.ProfileImg,
      },
      isAdmin: currentUser.Role === 'admin',
      messages: req.flash()
    });
  } catch (err) {
    console.error('Search error:', err);
    req.flash('error', 'Error performing search');
    res.status(500).redirect('/home');
  }
});

app.get('/api/follow-status/:userId', async (req, res) => {
  try {
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      const targetUser = await User.findById(req.params.userId);

      if (!currentUser || !targetUser) {
          return res.status(404).json({ success: false, message: 'User not found' });
      }

      const isFollowing = await Following.findOne({
          followerId: currentUser._id,
          followedId: targetUser._id,
      });

      res.json({ success: true, isFollowing: !!isFollowing });
  } catch (error) {
      console.error('Error checking follow status:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


app.post('/api/follow/:userId', async (req, res) => {
  try {
      console.log('Follow request received for user:', req.params.userId);
      
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      if (!currentUser) {
          console.log('Current user not found with cookie');
          return res.status(404).json({ success: false, message: "Current user not found" });
      }
      console.log('Current user found:', currentUser._id);
      
      const userToFollow = await User.findById(req.params.userId);
      if (!userToFollow) {
          console.log('User to follow not found with ID:', req.params.userId);
          return res.status(404).json({ success: false, message: "User to follow not found" });
      }
      console.log('User to follow found:', userToFollow._id);

      const existingFollow = await Following.findOne({
          followerId: currentUser._id,
          followedId: userToFollow._id,
      });

      if (!existingFollow) {
          // Create follow relationship
          console.log('Creating follow relationship between', currentUser._id, 'and', userToFollow._id);
          
          try {
              await Following.create({
                  followerId: currentUser._id,
                  followedId: userToFollow._id,
              });
              console.log('Follow relationship created successfully');
          } catch (followError) {
              console.error('Error creating follow relationship:', followError);
              return res.status(500).json({ success: false, message: "Error creating follow relationship" });
          }

          // Create follow notification
          console.log('Attempting to create notification');
          try {
              await createFollowNotification(currentUser._id, userToFollow._id);
              console.log('Notification creation process completed');
          } catch (notificationError) {
              console.error('Error in notification creation:', notificationError);
              // Continue even if notification fails
          }

          res.json({ success: true, message: "Followed successfully." });
      } else {
          console.log('Already following user');
          res.json({ success: false, message: "Already following." });
      }
  } catch (error) {
      console.error("Error handling follow:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// Enhanced createFollowNotification function with better error handling
async function createFollowNotification(followerId, followedId) {
    console.log('Creating follow notification from', followerId, 'to', followedId);
    
    try {
        const follower = await User.findById(followerId);
        if (!follower) {
            console.error('Follower not found with ID:', followerId);
            return;
        }
        console.log('Follower found:', follower.Username);
        
        const followed = await User.findById(followedId);
        if (!followed) {
            console.error('Followed user not found with ID:', followedId);
            return;
        }
        console.log('Followed user found:', followed.Username);

        // Check if Notification model exists and is accessible
        if (!Notification) {
            console.error('Notification model is not defined');
            return;
        }
        
        // Log the notification data we're about to create
        const notificationData = {
            recipient: followed._id,
            sender: follower._id,
            type: 'follow',
            message: `${follower.Username} has started following you.`,
            timestamp: new Date(),
            isRead: false,
        };
        console.log('Creating notification with data:', notificationData);
        
        // Create the notification with explicit error handling
        const newNotification = await Notification.create(notificationData);
        console.log('Follow notification created successfully:', newNotification._id);
        
        return newNotification;
    } catch (error) {
        console.error('Detailed error creating follow notification:', error);
        // Log more details about the error
        if (error.name === 'ValidationError') {
            for (let field in error.errors) {
                console.error(`Validation error in field '${field}':`, error.errors[field].message);
            }
        }
        throw error; // Re-throw to be caught by the calling function
    }
}

app.post('/api/unfollow/:userId', async (req, res) => {
  try {
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      const userToUnfollow = await User.findById(req.params.userId);

      if (!currentUser || !userToUnfollow) {
          return res.status(404).json({ success: false, message: 'User not found' });
      }

      await Following.findOneAndDelete({
          followerId: currentUser._id,
          followedId: userToUnfollow._id,
      });

      res.json({ success: true });
  } catch (error) {
      console.error('Unfollow error:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

app.get('/createpoll', async (req, res) => {
  try{
    if (req.cookies.auth==null||req.cookies.auth==undefined){
      res.redirect('/login');
      return;
    }
    var requser = await User.find({Cookie : req.cookies.auth});
    var currentuser =requser[0];
    var user = ({
      Username: currentuser.Username,
      ProfileImg: currentuser.ProfileImg,
    })
      res.render(path.join(__dirname,'./website/templates/createPoll.ejs'),{user:user, messages:req.flash()});
    }catch(error){
    console.log(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/createpoll', async (req, res) => {
  const currentUser = await User.findOne({ Cookie: req.cookies.auth });
  const user = {
    Username: currentUser.Username,
    ProfileImg: currentUser.ProfileImg,
    Phone: currentUser.PhoneNumber,
    Email: currentUser.Email,
    UID: currentUser._id
  };
  res.render(path.join(__dirname, './website/templates/createpoll.ejs'), {user: user});
});

app.post('/createPoll', upload.single('Image'), async (req, res) => {
    try {
        if (!req.cookies.auth) {
            return res.redirect('/login');
        }

        const currentUser = await User.findOne({ Cookie: req.cookies.auth });
        if (!currentUser) {
            return res.redirect('/login');
        }

        console.log('File uploaded:', req.file); // Debug log
        console.log('Upload directory:', uploadDir); // Debug log
        console.log('Full image path:', path.join(uploadDir, req.file ? req.file.filename : 'default.png')); // Debug log

        const newPoll = new Poll({
            PollID: new mongoose.Types.ObjectId().toString(),
            Task: req.body.Task,
            Title: req.body.Task,
            Description: req.body.Description,
            Date: req.body.Date,
            Time: req.body.Time,
            Location: req.body.Location,
            Deadline: req.body.Deadline,
            MaxParticipants: parseInt(req.body.MaxParticipants) || 10,
            Image: req.file ? req.file.filename : 'default.png',
            OwnerID: currentUser._id,
            Status: 'Active',
            participants: []
        });

        await newPoll.save();
        console.log('Saved poll with image:', newPoll.Image); // Debug log
        res.redirect('/profile');

    } catch (error) {
        console.error('Create poll error:', error);
        res.redirect('/createPoll');
    }
});

app.post('/vote/:pollId', async (req, res) => {
    try {
        const { optionIndex } = req.body;
        const currentUser = await User.findOne({ Cookie: req.cookies.auth });
        
        if (!currentUser) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const poll = await Poll.findById(req.params.pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }

        if (poll.participants.includes(currentUser._id)) {
            return res.status(400).json({ success: false, message: 'Already voted' });
        }

        poll.options[optionIndex].votes += 1;
        poll.participants.push(currentUser._id);
        await poll.save();

        res.json({ success: true });

    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ success: false, message: 'Failed to vote' });
    }
});

app.post('/api/join-poll/:pollId', async (req, res) => {
  try {
      if (!req.cookies.auth) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      if (!currentUser) {
          return res.status(401).json({ success: false, message: 'User not found' });
      }

      const poll = await Poll.findById(req.params.pollId).populate('OwnerID', 'Username _id');
      if (!poll) {
          return res.status(404).json({ success: false, message: 'Poll not found' });
      }

      // Check if user is already a participant
      const isParticipant = poll.participants.some(id => id.toString() === currentUser._id.toString());
      if (isParticipant) {
          return res.status(400).json({ success: false, message: 'Already joined' });
      }

      // Check if poll is full
      if (poll.participants.length >= poll.MaxParticipants) {
          return res.status(400).json({ success: false, message: 'Poll is full' });
      }

      // Add user to participants
      poll.participants.push(currentUser._id);
      await poll.save();

      // Create a notification for the poll owner
      if (!poll.OwnerID._id.equals(currentUser._id)) {
        const notification = new Notification({
            recipient: poll.OwnerID._id,
            sender: currentUser._id,
            type: 'poll-join',
            message: `${currentUser.Username} joined your poll.`,
            poll: poll._id,
            pollId: poll._id,
            pollTitle: poll.Task, // Add the poll title
            timestamp: new Date(),
            isRead: false,
        });
        await notification.save();
    }

      res.json({ success: true, message: 'Successfully joined poll' });
  } catch (error) {
      console.error('Join poll error:', error);
      res.status(500).json({ success: false, message: 'Failed to join poll' });
  }
});


app.post('/api/leave-poll/:pollId', async (req, res) => {
  try {
      if (!req.cookies.auth) {
          return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      if (!currentUser) {
          return res.status(401).json({ success: false, message: 'User not found' });
      }

      const poll = await Poll.findById(req.params.pollId).populate('OwnerID', 'Username _id');
      if (!poll) {
          return res.status(404).json({ success: false, message: 'Poll not found' });
      }

      // Remove user from participants
      poll.participants = poll.participants.filter(id => id.toString() !== currentUser._id.toString());
      await poll.save();

      // Create a notification for the poll owner
      if (!poll.OwnerID._id.equals(currentUser._id)) {
        const notification = new Notification({
            recipient: poll.OwnerID._id,
            sender: currentUser._id,
            type: 'poll-leave',
            message: `${currentUser.Username} joined your poll.`,
            poll: poll._id,
            pollId: poll._id,
            pollTitle: poll.Task, // Add the poll title
            timestamp: new Date(),
            isRead: false,
        });
        await notification.save();
    }

      res.json({ success: true, message: 'Successfully left poll' });
  } catch (error) {
      console.error('Leave poll error:', error);
      res.status(500).json({ success: false, message: 'Failed to leave poll' });
  }
});


app.get('/edit-poll/:id', async (req, res) => {
  try {
    if (!req.cookies.auth) {
      return res.redirect('/login');
    }

    const currentuser = await User.findOne({ Cookie: req.cookies.auth });
    if (!currentuser) {
      return res.redirect('/login');
    }

    const poll = await Poll.findById(req.params.id);
    if (!poll) {
      req.flash('error', 'Poll not found');
      return res.redirect('/profile');
    }

    // Check if the current user owns the poll
    if (poll.OwnerID.toString() !== currentuser._id.toString()) {
      req.flash('error', 'Unauthorized to edit this poll');
      return res.redirect('/profile');
    }

    const user = {
      Username: currentuser.Username,
      ProfileImg: currentuser.ProfileImg,
      FirstName: currentuser.FirstName,
      LastName: currentuser.LastName,
      Email: currentuser.Email,
      ID: currentuser._id
    };

    res.render(path.join(__dirname,'./website/templates/editPoll.ejs'), {
      user: user,
      poll: poll,
      messages: req.flash()
    });

  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Error loading edit page');
    res.redirect('/profile');
  }
});

app.post('/update-poll/:id', upload.single('image'), async (req, res) => {
  try {
    const pollId = req.params.id;
    const updateData = {
      Task: req.body.Task,
      Description: req.body.Description,
      Date: req.body.Date,
      Time: req.body.Time,
      Location: req.body.Location,
      Deadline: req.body.Deadline,
      MaxParticipants: req.body.MaxParticipants,
      Visibility: req.body.Visibility
    };

    // If a new image was uploaded
    if (req.file) {
      updateData.Image = req.file.filename;
    }

    const poll = await Poll.findByIdAndUpdate(
      pollId,
      updateData,
      { new: true }
    );

    if (!poll) {
      req.flash('error', 'Poll not found');
      return res.redirect('/profile');
    }

    req.flash('success', 'Poll updated successfully');
    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating poll:', error);
    req.flash('error', 'Failed to update poll');
    res.redirect('/profile');
  }
});

app.post('/api/follow/:userId', async (req, res) => {
  try {
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      const userToFollow = await User.findById(req.params.userId);

      if (!currentUser || !userToFollow) {
          return res.status(404).json({ success: false, message: "User not found" });
      }

      const existingFollow = await Following.findOne({
          followerId: currentUser._id,
          followedId: userToFollow._id,
      });

      if (!existingFollow) {
          // Create follow relationship
          await Following.create({
              followerId: currentUser._id,
              followedId: userToFollow._id,
          });

          // Create follow notification
          await createFollowNotification(currentUser._id, userToFollow._id);

          res.json({ success: true, message: "Followed successfully." });
      } else {
          res.json({ success: false, message: "Already following." });
      }
  } catch (error) {
      console.error("Error handling follow:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/api/unfollow/:userId', async (req, res) => {
  try {
      console.log('Unfollow request for user:', req.params.userId);
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      const userToUnfollow = await User.findById(req.params.userId);

      if (!currentUser || !userToUnfollow) {
          console.log('User not found:', { currentUser: !!currentUser, userToUnfollow: !!userToUnfollow });
          return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Remove from Following collection
      const followRelation = await Following.findOneAndDelete({
          followerId: currentUser._id,
          followedId: userToUnfollow._id,
      });

      if (!followRelation) {
          return res.status(400).json({ success: false, message: "You are not following this user." });
      }

      console.log('Unfollow successful');
      res.json({ success: true, message: "Unfollowed successfully." });
  } catch (error) {
      console.error('Unfollow error:', error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});


app.get('/api/get-notifications', async (req, res) => {
  try {
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      if (!currentUser) {
          return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // Make sure to populate the sender field with Username and ProfileImg
      const notifications = await Notification.find({ recipient: currentUser._id })
          .sort({ timestamp: -1 })
          .populate('sender', 'FirstName LastName ProfileImg _id'); // Added _id to populate

      console.log(`Found ${notifications.length} notifications for user ${currentUser.Username}`);
      
      // Log the first notification for debugging
      if (notifications.length > 0) {
          console.log('First notification sample:', {
              type: notifications[0].type,
              message: notifications[0].message,
              sender: notifications[0].sender ? {
                  id: notifications[0].sender._id,
                  username: notifications[0].sender.Username
              } : 'Not populated'
          });
      }

      res.json({ Notifications: notifications });
  } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Add this route to handle notification clicks
app.post('/api/mark-notification-read/:notificationId', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.notificationId,
      { isRead: true },
      { new: true }
    );
    res.json({ success: true, notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false });
  }
});

// Add this route to get notification redirect URL
app.get('/api/notification-redirect/:notificationId', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId)
      .populate('sender');

    if (!notification) {
      return res.status(404).json({ success: false });
    }

    let redirectUrl = '';
    if (notification.type === 'follow') {
      redirectUrl = `/profileview/${notification.sender._id}`;
    } else if (notification.type === 'message') {
      redirectUrl = `/chat?userId=${notification.sender._id}&userName=${notification.sender.Username}`;
    }

    res.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('Error getting redirect URL:', error);
    res.status(500).json({ success: false });
  }
});

app.delete('/api/delete-notification/:notificationId', async (req, res) => {
  try {
      await Notification.findByIdAndDelete(req.params.notificationId);
      res.json({ success: true });
  } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ success: false });
  }
});

app.delete('/api/clear-notifications', async (req, res) => {
  try {
      const currentUser = await User.findOne({ Cookie: req.cookies.auth });
      if (!currentUser) {
          return res.status(401).json({ success: false });
      }
      await Notification.deleteMany({ recipient: currentUser._id });
      res.json({ success: true });
  } catch (error) {
      console.error('Error clearing notifications:', error);
      res.status(500).json({ success: false });
  }
});

app.get('/adminLogin', (req, res) => {
  res.render(path.join(__dirname, './website/templates/adminLogin.ejs'), { 
    messages: {
      success: req.flash('success'),
      error: req.flash('error'),
      submitted: true
    }
  });
});

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Basic validation
    if (!email || !password) {
      req.flash('error', 'Email and password are required');
      return res.redirect('/adminLogin');
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      req.flash('error', 'Invalid email format');
      return res.redirect('/adminLogin');
    }

    const admin = await User.findOne({ Email: email });
    if (!admin || admin.Role !== 'admin') {
      req.flash('error', 'Invalid admin credentials');
      return res.redirect('/adminLogin');
    }

    const isMatch = await bcrypt.compare(password, admin.Password);
    if (!isMatch) {
      req.flash('error', 'Invalid password');
      return res.redirect('/adminLogin');
    }

    // Generate and set cookie for admin
    const adminCookie = generateAdminCookie(); // You'll need to implement this function
    res.cookie('adminAuth', adminCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });

    // Update admin's cookie in database
    await User.findByIdAndUpdate(admin._id, { AdminCookie: adminCookie });

    req.flash('success', 'Welcome Admin!');
    return res.redirect('/admin');
  } catch (error) {
    console.error('Error during admin login:', error);
    req.flash('error', 'An error occurred during login');
    return res.redirect('/adminLogin');
  }
});

// Add this helper function
function generateAdminCookie() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'admin-';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  if (!req.session.adminId || !req.session.isAdmin) {
      return res.redirect('/adminLogin');
  }
  try {
      const admin = await User.findById(req.session.adminId);
      if (!admin || admin.Role !== 'admin') {
          return res.redirect('/adminLogin');
      }
      next();
  } catch (error) {
      res.redirect('/adminLogin');
  }
};

async function isAdmin(req, res, next) {
  try {
    // Check for admin-specific cookie
    if (!req.cookies.adminAuth) {
      req.flash('error', 'Please login as admin');
      return res.redirect('/adminLogin');
    }

    // Find admin by admin cookie
    const admin = await User.findOne({ 
      AdminCookie: req.cookies.adminAuth,
      Role: 'admin'
    });

    if (!admin) {
      // Clear invalid admin cookie
      res.clearCookie('adminAuth');
      req.flash('error', 'Invalid admin session');
      return res.redirect('/adminLogin');
    }

    // Store admin info in request for later use
    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    req.flash('error', 'Authentication error');
    res.redirect('/adminLogin');
  }
}

// Admin Dashboard Route
app.get('/admin', isAdmin, async (req, res) => {
  try {
      // Get all users
      const allUsers = await User.find({}).sort({ JoinedAt: -1 });
      
      // Get stats
      const stats = {
          totalUsers: await User.countDocuments({}),
          totalPosts: await Post.countDocuments({}),
          totalPolls: await Poll.countDocuments({})
      };

      // Get recent posts with owner details
      const recentPosts = await Post.find({})
          .populate('OwnerID')
          .sort({ createdAt: -1 })
          .limit(6);

      // Get recent polls with owner details
      const polls = await Poll.find({})
          .populate('OwnerID')
          .sort({ createdAt: -1 })
          .limit(6);

      res.render(path.join(__dirname, './website/templates/dashboard.ejs'), {
          title: 'Admin Dashboard',
          stats,
          users: allUsers,
          recentPosts,
          polls, // Add this line to pass polls data
          admin: {
              firstName: req.admin.FirstName,
              lastName: req.admin.LastName
          },
          messages: req.flash()
      });
  } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).send('Server error');
  }
});

// Manage Users Route
// Manage Users Route
app.get('/admin/users', isAdmin, async (req, res) => {
  try {
    const { query = '', department = '', year = '' } = req.query;
    let searchCriteria = { Role: { $ne: 'admin' } }; // Exclude admin users from search

    if (query) {
      const queryParts = query.trim().split(" ");
      if (queryParts.length === 1) {
        searchCriteria.$or = [
          { FirstName: { $regex: new RegExp(queryParts[0], 'i') } },
          { LastName: { $regex: new RegExp(queryParts[0], 'i') } },
          { Username: { $regex: new RegExp(queryParts[0], 'i') } },
          { department: { $regex: new RegExp(queryParts[0], 'i') } },
        ];
      } else if (queryParts.length === 2) {
        searchCriteria.$and = [
          { FirstName: { $regex: new RegExp(queryParts[0], 'i') } },
          { LastName: { $regex: new RegExp(queryParts[1], 'i') } },
        ];
      }
    }

    // Add department filter if provided
    if (department) {
      searchCriteria.department = department;
    }

    // Add year filter if provided
    if (year) {
      searchCriteria.year = parseInt(year);
    }

    // Get departments and years for filters
    const departments = await User.distinct('department', { Role: { $ne: 'admin' } });
    const years = await User.distinct('year', { Role: { $ne: 'admin' } });

    // Get users with counts, excluding admins
    const users = await User.find(searchCriteria).lean();
    const usersWithCounts = await Promise.all(users.map(async (user) => {
      const followersCount = await Following.countDocuments({ followedId: user._id });
      const followingCount = await Following.countDocuments({ followerId: user._id });
      
      return {
        ...user,
        followersCount,
        followingCount
      };
    }));

    res.render(path.join(__dirname, './website/templates/search.ejs'), {
      title: 'User Management',
      users: usersWithCounts,
      query: query || '',
      department: department || '',
      year: year || '',
      departments: departments || [],
      years: years || [],
      admin: {
        firstName: req.admin.FirstName,
        lastName: req.admin.LastName,
      },
      user: req.admin,
      messages: req.flash(),
      isAdmin: true,
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    req.flash('error', 'Error fetching users');
    res.status(500).redirect('/admin');
  }
});

app.post('/admin/users/delete', isAdmin, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId || !reason) {
      req.flash('error', 'User ID and reason are required');
      return res.status(400).redirect('/admin/users');
    }

    const user = await User.findById(userId);
    if (!user) {
      req.flash('error', 'User not found');
      return res.status(404).redirect('/admin/users');
    }

    await User.findByIdAndDelete(userId);

    // Send notification to the deleted user
    await Notification.create({
      userId,
      type: 'account-delete',
      message: `Your account has been deleted for the following reason: ${reason}`,
      timestamp: new Date(),
    });

    req.flash('success', 'User deleted and notified successfully');
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Error deleting user:', err);
    req.flash('error', 'Error deleting user');
    res.status(500).redirect('/admin/users');
  }
});

// Manage Posts Route
app.get('/admin/posts', authenticateAdmin, async (req, res) => {
  try {
      const posts = await Post.find();
      res.render('posts', { title: 'Post Management', posts });
  } catch (err) {
      res.status(500).send('Error fetching posts.');
  }
});

// Manage Polls Route
app.get('/admin/polls', authenticateAdmin, async (req, res) => {
  try {
      const polls = await Poll.find();
      res.render('polls', { title: 'Poll Management', polls });
  } catch (err) {
      res.status(500).send('Error fetching polls.');
  }
});

// Admin Logout Route
app.get('/admin/logout', async (req, res) => {
  try {
    if (req.cookies.adminAuth) {
      // Clear admin cookie from database
      await User.updateOne(
        { AdminCookie: req.cookies.adminAuth },
        { $unset: { AdminCookie: 1 } }
      );
      // Clear cookie from browser
      res.clearCookie('adminAuth');
    }
    req.flash('success', 'Logged out successfully');
    res.redirect('/adminLogin');
  } catch (error) {
    console.error('Logout error:', error);
    res.redirect('/adminLogin');
  }
});

app.delete('/admin/delete-post/:postId', isAdmin, async (req, res) => {
  try {
      const postId = req.params.postId;
      const post = await Post.findById(postId).populate('OwnerID');
      
      if (!post) {
          return res.status(404).json({ success: false, message: 'Post not found' });
      }

      // Create notification for the post owner
      const notification = new Notification({
          recipient: post.OwnerID._id,
          sender: req.admin._id,
          type: 'post-delete',
          message: `Your post "${post.Title}" has been deleted by admin.`,
          timestamp: new Date(),
          isRead: false
      });
      await notification.save();

      // Delete the post
      await Post.findByIdAndDelete(postId);

      // Emit socket event if the user is online
      const recipientSocketId = userToSocket.get(post.OwnerID._id.toString());
      if (recipientSocketId) {
          io.to(recipientSocketId).emit('notification', {
              type: 'post-delete',
              message: `Your post "${post.Title}" has been deleted by admin.`
          });
      }

      res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete poll route
app.delete('/admin/delete-poll/:pollId', isAdmin, async (req, res) => {
  try {
      const pollId = req.params.pollId;
      const poll = await Poll.findById(pollId).populate('OwnerID');
      
      if (!poll) {
          return res.status(404).json({ success: false, message: 'Poll not found' });
      }

      // Create notification for the poll owner
      const notification = new Notification({
          recipient: poll.OwnerID._id,
          sender: req.admin._id,
          type: 'poll-delete',
          message: `Your poll "${poll.Task}" has been deleted by admin.`,
          timestamp: new Date(),
          isRead: false
      });
      await notification.save();

      // Delete the poll
      await Poll.findByIdAndDelete(pollId);

      // Emit socket event if the user is online
      const recipientSocketId = userToSocket.get(poll.OwnerID._id.toString());
      if (recipientSocketId) {
          io.to(recipientSocketId).emit('notification', {
              type: 'poll-delete',
              message: `Your poll "${poll.Task}" has been deleted by admin.`
          });
      }

      res.json({ success: true, message: 'Poll deleted successfully' });
  } catch (error) {
      console.error('Error deleting poll:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

const authenticateUser = async (req, res, next) => {
  try {
    if (!req.cookies.auth) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const user = await User.findOne({ Cookie: req.cookies.auth });
    if (!user) {
      return res.status(401).json({ message: 'Invalid authentication' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

app.post('/api/ban-user', async (req, res) => {
  try {
      // Check if user is authenticated and is admin using adminAuth cookie
      const adminUser = await User.findOne({ AdminCookie: req.cookies.adminAuth });
      if (!adminUser || adminUser.Role !== 'admin') {
          return res.status(403).json({ message: 'Unauthorized: Admin access required' });
      }

      const { userId, reason } = req.body;
      
      // Validate user exists and is not an admin
      const userToBan = await User.findById(userId);
      if (!userToBan) {
          return res.status(404).json({ message: 'User not found' });
      }
      if (userToBan.Role === 'admin') {
          return res.status(403).json({ message: 'Cannot ban an admin user' });
      }
      
      // Check if user is already banned
      const existingBan = await BannedUser.findOne({ userID: userId });
      if (existingBan) {
          return res.status(400).json({ message: 'User is already banned' });
      }

      // Create new ban record
      const bannedUser = new BannedUser({
          userID: userId,
          reason: reason,
          bannedBy: adminUser._id
      });

      await bannedUser.save();

      // Update user's status and remove their auth cookie
      await User.findByIdAndUpdate(userId, { 
          status: 'banned',
          $unset: { Cookie: "" }
      });

      // Create notification for banned user
      const notification = new Notification({
          recipient: userId,
          sender: adminUser._id,
          type: 'account-ban',
          message: `Your account has been banned. Reason: ${reason}`,
          timestamp: new Date()
      });
      await notification.save();

      // If using Socket.IO, emit event to force logout
      const userSocketId = userToSocket.get(userId);
      if (userSocketId) {
          io.to(userSocketId).emit('force-logout', {
              message: `Your account has been banned. Reason: ${reason}`
          });
      }

      res.json({ success: true, message: 'User has been banned successfully' });
  } catch (error) {
      console.error('Ban user error:', error);
      res.status(500).json({ message: 'Failed to ban user' });
  }
});

app.get('/api/check-ban/:userId', async (req, res) => {
  try {
      const bannedUser = await BannedUser.findOne({ userID: req.params.userId });
      if (bannedUser) {
          res.json({
              isBanned: true,
              reason: bannedUser.reason,
              bannedAt: bannedUser.bannedAt
          });
      } else {
          res.json({ isBanned: false });
      }
  } catch (error) {
      console.error('Check ban status error:', error);
      res.status(500).json({ message: 'Failed to check ban status' });
  }
});

// Add route to unban user (admin only)
// Add this with your other routes
app.post('/api/unban-user', async (req, res) => {
  try {
      const { userId } = req.body;
      
      // Check if the requester is an admin
      const adminUser = await User.findOne({ Cookie: req.cookies.auth, Role: 'admin' });
      if (!adminUser) {
          return res.status(403).json({ message: 'Unauthorized: Admin access required' });
      }

      // Update user status
      await User.findByIdAndUpdate(userId, { status: 'active' });
      
      // Remove from banned users collection
      await BannedUser.findOneAndDelete({ userId: userId });

      res.json({ success: true, message: 'User unbanned successfully' });
  } catch (error) {
      console.error('Error unbanning user:', error);
      res.status(500).json({ message: 'Failed to unban user' });
  }
});

// Render the Admin Events Management Page
app.get('/admin/events', async (req, res) => {
  try {
      // Fetch all events for rendering in the calendar
      const events = await Event.find();
      const formattedEvents = events.map(event => ({
          id: event._id,
          title: event.title,
          start: `${event.date}T${event.time}`, // Combine date and time for FullCalendar
          description: event.description
      }));
      res.render(path.join(__dirname, './website/templates/events.ejs'), {
          title: 'Events Management',
          events: JSON.stringify(formattedEvents) // Pass events as JSON string for client-side use
      });
  } catch (error) {
      console.error('Error rendering events page:', error);
      res.status(500).send('Server error');
  }
});

// API to Get Events (for FullCalendar)
app.get('/api/events', async (req, res) => {
  try {
      const events = await Event.find();
      const formattedEvents = events.map(event => {
          const dateTime = new Date(event.date); // Use the existing ISO date
          if (event.time) {
              // Append time only if it's provided
              const [hours, minutes] = event.time.split(':');
              dateTime.setHours(hours, minutes);
          }

          // Ensure the date is valid
          if (isNaN(dateTime.getTime())) {
              console.error(`Invalid event data: ${JSON.stringify(event)}`);
              throw new Error(`Invalid date or time: ${dateTime}`);
          }

          return {
              id: event._id,
              title: event.title,
              start: dateTime.toISOString(), // Full ISO format for FullCalendar
              description: event.description,
          };
      });
      res.json(formattedEvents);
  } catch (error) {
      console.error('Error fetching events:', error.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});

// API to Create a New Event
app.post('/api/events', async (req, res) => {
  try {
      const { title, date, time, description } = req.body;
      const event = new Event({ title, date, time, description });
      await event.save();
      res.status(201).json(event);
  } catch (error) {
      console.error('Error saving event:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});

// API to Update an Event
app.put('/api/events/:id', async (req, res) => {
  try {
      const { title, date, time, description } = req.body;
      const event = await Event.findByIdAndUpdate(
          req.params.id,
          { title, date, time, description },
          { new: true }
      );
      if (!event) {
          return res.status(404).json({ message: 'Event not found' });
      }
      res.json(event);
  } catch (error) {
      console.error('Error updating event:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});

// API to Delete an Event
app.delete('/api/events/:id', async (req, res) => {
  try {
      const event = await Event.findByIdAndDelete(req.params.id);
      if (!event) {
          return res.status(404).json({ message: 'Event not found' });
      }
      res.json({ message: 'Event deleted successfully' });
  } catch (error) {
      console.error('Error deleting event:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/user/events', authenticateUser, (req, res) => {
    try {
        // Render the user calendar page with user data
        res.render(path.join(__dirname, './website/templates/userEvents.ejs'), {
            user: req.user // Pass the user object to the template
        });
    } catch (error) {
        console.error('Error rendering user calendar:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/manage-posts-polls', (req, res) => {
  res.render(path.join(__dirname,'./website/templates/managePostsPolls.ejs'));
});

app.get('/api/posts', async (req, res) => {
  try {
      const posts = await Post.find();
      res.json(posts);
  } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: 'Failed to fetch posts' });
  }
});

// Route to delete a specific post
app.get('/api/posts/delete/:id', async (req, res) => {
  try {
      const postId = req.params.id;
      const deletedPost = await Post.findByIdAndDelete(postId);
      if (!deletedPost) {
          return res.status(404).json({ success: false, message: 'Post not found' });
      }
      res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ success: false, message: 'Failed to delete post' });
  }
});

// Route to fetch all polls
app.get('/api/polls', async (req, res) => {
  try {
      const polls = await Poll.find();
      res.json(polls);
  } catch (error) {
      console.error('Error fetching polls:', error);
      res.status(500).json({ message: 'Failed to fetch polls' });
  }
});

// Route to delete a specific poll
app.get('/api/polls/delete/:id', async (req, res) => {
  try {
      const pollId = req.params.id;
      const deletedPoll = await Poll.findByIdAndDelete(pollId);
      if (!deletedPoll) {
          return res.status(404).json({ success: false, message: 'Poll not found' });
      }
      res.json({ success: true, message: 'Poll deleted successfully' });
  } catch (error) {
      console.error('Error deleting poll:', error);
      res.status(500).json({ success: false, message: 'Failed to delete poll' });
  }
});

app.all('*', (req, res) => {
  res.status(404).render(path.join(__dirname,'./website/templates/errorpage.ejs'));
});