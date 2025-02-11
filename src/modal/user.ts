import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  projects: [
    {
      key: {
        type: String,
        required: true, // Ensure each project has a unique key
      },
      name: {
        type: String,
        required: true,
      },
      image:{
        type: String,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now, // Default to the current date
      },
    },
  ],
  isActive: {
    type: Boolean,
    default: true, // Default to true
  },
});

const User = mongoose.model("User", userSchema);

export default User;