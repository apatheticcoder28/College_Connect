const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
    PollID: { type: String, required: true },
    Task: { type: String, required: true },
    Title: { type: String, required: true },
    Description: String,
    Date: Date,
    Time: String,
    Location: String,
    Deadline: Date,
    MaxParticipants: { type: Number, default: 10 },
    Image: { type: String, default: 'default.png' },
    OwnerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    Status: { type: String, default: 'Active' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const Poll = mongoose.model('Poll', pollSchema);

module.exports = Poll;