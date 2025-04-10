const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
var UserSchema = require("./models/User");
var User = mongoose.model("User",UserSchema); // Adjust the path to your User model

const createFirstAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/AWP', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to database');

        // Check if an admin already exists
        const existingAdmin = await User.findOne({ Role: 'admin' });
        if (existingAdmin) {
            console.log('Admin already exists. No need to create one.');
            return;
        }

        // Create a new admin user
        const hashedPassword = await bcrypt.hash('your_secure_password', 10);
        const admin = new User({
            FirstName: 'Anom',
            LastName: 'Faiz',
            Email: 'UndergroundFaith@infinityRecurrsion.com',
            Password: hashedPassword,
            Role: 'admin',
             // Set the role to 'admin'
        });

        await admin.save();
        console.log('First admin created successfully!');
    } catch (error) {
        console.error('Error creating admin:', error.message);
    } finally {
        // Close the database connection
        mongoose.connection.close();
    }
};

// Call the function
createFirstAdmin();
