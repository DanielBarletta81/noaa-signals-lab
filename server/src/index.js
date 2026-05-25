import express from "express";
import cors from "cors";
import { signalsRouter } from "./routes/signals.js";

const app = express();
const port = process.env.PORT || 4200;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NOAA Signal Explorer",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", signalsRouter);

app.listen(port, () => {
  console.log(`NOAA Signal Explorer server running at http://localhost:${port}`);
});