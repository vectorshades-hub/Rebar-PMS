const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  // Plain text for now (explicit project decision, same as the Schedule-Tracker
  // source). TODO: switch to bcrypt hashing before any real deployment.
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "management", "team_lead", "user", "finance"],
    default: "user",
  },
  linkedTls: { type: [String], default: [] }, // `user` / `management`: team leads whose records they see (management with none linked sees all)
});

module.exports = mongoose.model("User", userSchema);
