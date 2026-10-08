const mongoose = require("mongoose");

const nameSchema = { name: { type: String, required: true, unique: true, trim: true } };

// A project belongs to one client, referenced by name (same convention as the source).
const Project = mongoose.model(
  "Project",
  new mongoose.Schema({
    ...nameSchema,
    client: { type: String, default: "", trim: true },
    description: { type: String, default: "" },
    // Manually completed lifecycle stages (null = not yet): OFA, Fabrication, whole project.
    lifecycle: {
      ofaAt: { type: Date, default: null },
      fabricationAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
    createdAt: { type: Date, default: Date.now },
  })
);
const Client = mongoose.model("Client", new mongoose.Schema(nameSchema));

module.exports = { Project, Client };
