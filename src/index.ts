import express from "express";
import { connectRedis } from "./cache/redis";
import { errorHandler } from "./middleware/errorHandler";
import { getBills } from "./handlers/bills";
import { getProviders } from "./handlers/providers";

// Create a new express application instance
const app = express();

// Set the network port
const port = process.env.PORT || 3000;

connectRedis()
    .then(() => {
        console.log("Connected to Redis");
    })
    .catch(console.error);

// Enable JSON parsing for incoming requests
app.use(express.json());

// Define the root path with a greeting message
app.get("/", (req, res) => {
    res.json({ message: "Welcome to the Express + TypeScript Server!" });
});

// Define the bills and providers routes
app.get("/bills", getBills);
app.get("/providers", getProviders);

// Use the error handler middleware
app.use(errorHandler);

// Start the Express server
app.listen(port, () => {
    console.log(`The server is running at http://localhost:${port}`);
});
