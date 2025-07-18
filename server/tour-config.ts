// Tour configuration that persists across deployments
// This file should be backed up and restored during deployments

export interface TourConfig {
  propertyId: string;
  tourUrl: string;
  uploadedAt: string;
  ftpPath: string;
}

// In-memory storage (you could also use a JSON file or external config service)
let tourConfigs: TourConfig[] = [];

export function addTourConfig(config: TourConfig) {
  tourConfigs.push(config);
  // Optionally save to file for persistence
  saveTourConfigs();
}

export function getTourConfig(propertyId: string): TourConfig | undefined {
  return tourConfigs.find(config => config.propertyId === propertyId);
}

export function getAllTourConfigs(): TourConfig[] {
  return tourConfigs;
}

export function removeTourConfig(propertyId: string) {
  tourConfigs = tourConfigs.filter(config => config.propertyId !== propertyId);
  saveTourConfigs();
}

// Save to file for persistence across deployments
function saveTourConfigs() {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'tour-configs.json');
    fs.writeFileSync(configPath, JSON.stringify(tourConfigs, null, 2));
  } catch (error) {
    console.error('Failed to save tour configs:', error);
  }
}

// Load from file on startup
export function loadTourConfigs() {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'tour-configs.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      tourConfigs = JSON.parse(data);
      console.log(`Loaded ${tourConfigs.length} tour configurations`);
    }
  } catch (error) {
    console.error('Failed to load tour configs:', error);
  }
}

// Initialize on module load
loadTourConfigs(); 