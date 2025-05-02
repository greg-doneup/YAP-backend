import express from "express";
import dotenv from "dotenv";
import { corsMw } from "./middleware/cors";
import authProxy from "./proxy/auth";
import learningProxy from "./proxy/learning";
import profileProxy from "./proxy/profile";
import rewardProxy from "./proxy/reward";
import dashboard from "./routes/dashboard";
import health from "./routes/health";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

app.use(corsMw);
app.use(express.json());

app.use("/auth",    authProxy);          // /auth/*
app.use("/learning", learningProxy);     // /learning/*
app.use("/profile",  profileProxy);      // /profile/*
app.use("/reward",   rewardProxy);       // /reward/*

app.use("/dashboard", dashboard);
app.use("/healthz",   health);

app.listen(PORT, () => console.log("gateway-service on :" + PORT));
