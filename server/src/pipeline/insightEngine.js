export function createSignalInsight({ product, latestValue, trend }) {
  if (product === "water_temperature") {
    if (latestValue >= 26) {
      return "Water temperature is elevated. Warm water can increase metabolic stress and reduce dissolved oxygen availability for estuarine organisms.";
    }

    if (latestValue <= 8) {
      return "Water temperature is low. Biological activity may slow, including feeding and growth in many estuarine species.";
    }

    if (trend === "rising") {
      return "Water temperature is in a moderate range but trending upward. Continued warming can change oxygen dynamics and organism stress.";
    }

    return "Water temperature is within a moderate range for many estuarine biological processes.";
  }

  if (product === "salinity") {
    return "Salinity helps define estuary habitat zones. Changes in salinity can shift species distributions and stress organisms adapted to narrower ranges.";
  }

  return "This signal is being interpreted as part of a coastal monitoring record.";
}