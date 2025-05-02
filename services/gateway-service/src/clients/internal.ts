import axios from "axios";

export const internal = axios.create({
  timeout: 4000,
  headers: { "Content-Type": "application/json" }
});
