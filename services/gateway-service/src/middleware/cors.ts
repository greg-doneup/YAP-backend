import cors from "cors";
export const corsMw = cors({
  origin: [
    "capacitor://localhost", 
    "http://localhost:8100", 
    "https://goyap.ai",           // Production YAP landing page
    "http://localhost:4200",      // Local Angular dev server
    "http://localhost:3000"       // Additional local dev server
  ],
  credentials: true
});
