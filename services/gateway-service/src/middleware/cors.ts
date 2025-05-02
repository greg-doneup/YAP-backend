import cors from "cors";
export const corsMw = cors({
  origin: ["capacitor://localhost", "http://localhost:8100"],
  credentials: true
});
