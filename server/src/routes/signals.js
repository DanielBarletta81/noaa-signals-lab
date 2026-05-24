import express from "express";
import { fetchNoaaProduct } from "../adapters/noaaClient.js";
import { processSignal } from "../pipeline/signalProcessor.js";

export const signalsRouter = express.Router();

signalsRouter.get("/signals", async (req, res) => {
  try {
    const station = req.query.station || "8454000";
    const product = req.query.product || "water_temperature";
    const range = Number(req.query.range || 24);

    const points = await fetchNoaaProduct({
      station,
      product,
      range,
      interval: "h",
    });

    const processed = processSignal(points);

    res.json({
      ok: true,
      station,
      product,
      source: "NOAA CO-OPS Data Retrieval API",
      processed,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});