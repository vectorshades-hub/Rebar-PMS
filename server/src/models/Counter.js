const mongoose = require("mongoose");

const Counter = mongoose.model(
  "Counter",
  new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } })
);

/** Atomically increments and returns the next number for `name`. */
async function nextSequence(name) {
  const doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
}

module.exports = { Counter, nextSequence };
