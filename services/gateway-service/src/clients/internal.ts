import axiosRetry from "axios-retry";
import axios from "axios";

export const internal = axios.create({
  timeout: 4000,                       // 4‑second hard timeout
  headers: { "Content-Type": "application/json" }
});

axiosRetry(internal, { retries: 2, retryDelay: axiosRetry.exponentialDelay });
