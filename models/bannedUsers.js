const mongoose = require('mongoose');

const bannedUserSchema = new mongoose.Schema({
    userID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bannedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('BannedUser', bannedUserSchema);