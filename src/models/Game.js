const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  currentWord: {
    type: String,
    required: true
  },
  usedWords: [{
    word: String,
    userId: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  lastUserId: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Game', gameSchema);