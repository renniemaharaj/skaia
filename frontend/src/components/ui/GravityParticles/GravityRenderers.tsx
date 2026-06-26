import type React from "react";
import { useEffect, useState } from "react";
import GravityParticles from "./GravityParticles";
import type { AttractorParticle } from "./engine";

interface CenterAnchoredSystemProps {
  particleCount?: number;
}

export const CenterAnchoredSystem: React.FC<CenterAnchoredSystemProps> = ({
  particleCount = 250,
}) => {
  const [attractors, setAttractors] = useState<AttractorParticle[]>([]);

  useEffect(() => {
    const handleResize = () => {
      setAttractors([
        {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          mass: 800, // Very heavy to anchor the system
          color: "#ffffff",
        },
      ]);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return <GravityParticles particleCount={particleCount} attractors={attractors} />;
};

interface TextGravityRendererProps {
  text: string;
  particleCount?: number;
}

export const TextGravityRenderer: React.FC<TextGravityRendererProps> = ({
  text,
  particleCount = 400,
}) => {
  const [attractors, setAttractors] = useState<AttractorParticle[]>([]);

  useEffect(() => {
    const generateAttractors = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Clear with black
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw text in white
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Responsive font size
      const fontSize = Math.min(canvas.width / Math.max(text.length * 0.6, 1), canvas.height / 3);
      ctx.font = `900 ${fontSize}px "Inter", "Roboto", sans-serif`;

      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      const newAttractors: AttractorParticle[] = [];
      const step = 12; // Sample every 12 pixels

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];

          if (r > 128) {
            // If pixel is bright enough
            newAttractors.push({
              x,
              y,
              mass: 30, // Small mass per letter pixel
              color: "#aaaaaa",
            });
          }
        }
      }
      setAttractors(newAttractors);
    };

    generateAttractors();

    // Add small delay on resize to prevent too many re-computations
    let timeout: number;
    const handleResize = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(generateAttractors, 200);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [text]);

  return <GravityParticles particleCount={particleCount} attractors={attractors} />;
};
