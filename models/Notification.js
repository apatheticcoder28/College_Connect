const mongoose = require("mongoose");
const User = require("./User"); // Adjust the path if needed

// Schema
const NotificationSchema = new mongoose.Schema({
    recipient: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    pollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll' },
    pollTitle: { type: String }, // Store the poll title
    timestamp: {
      type: Date,
      default: Date.now
    },
    isRead: {
      type: Boolean,
      default: false
    }
});

// Export the model directly for simpler importing
const Notification = mongoose.model("Notification", NotificationSchema);
module.exports = Notification;