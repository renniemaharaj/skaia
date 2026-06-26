import { useAtom } from "jotai";
import { Link } from "react-router-dom";
import { physicsSettingsAtom } from "../../../atoms/physics";
import Select from "../../input/Select";
import { type PhysicsSettings, defaultSettings } from "../../ui/GravityParticles/engine";

const Section = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => (
  <details className="pp-physics-section" open={defaultOpen}>
    <summary className="pp-physics-section-title">{title}</summary>
    <div className="pp-physics-section-content">{children}</div>
  </details>
);

const PhysicsControls = () => {
  const [settings, setSettings] = useAtom(physicsSettingsAtom);

  const updateSetting = <K extends keyof PhysicsSettings>(key: K, value: PhysicsSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
  };

  return (
    <div className="pp-physics-controls">
      <Section title="Renderer" defaultOpen>
        <div className="pp-physics-control">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <span>Style</span>
            <Select
              value={settings.rendererType}
              options={[
                { value: "default", label: "Default Gravity" },
                { value: "center-anchored", label: "Center Anchored System" },
                { value: "text", label: "Text Swarm (Not Ready)", disabled: true },
              ]}
              onChange={e =>
                updateSetting("rendererType", e.target.value as PhysicsSettings["rendererType"])
              }
              className="pp-physics-select"
              aria-label="Style"
            />
          </div>
        </div>

        {settings.rendererType === "text" && (
          <div className="pp-physics-control">
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Text</span>
              <input
                type="text"
                value={settings.rendererText}
                onChange={e => updateSetting("rendererText", e.target.value)}
                className="pp-physics-input"
                style={{ width: "120px", textAlign: "right" }}
              />
            </label>
          </div>
        )}
      </Section>

      <Section title="Environment">
        <div className="pp-physics-control">
          <label>
            <span>Gravity (G)</span>
            <span>{settings.gravityConstant.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.01"
            max="2.0"
            step="0.01"
            value={settings.gravityConstant}
            onChange={e => updateSetting("gravityConstant", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <label>
            <span>Max Velocity</span>
            <span>{settings.maxVelocity}</span>
          </label>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={settings.maxVelocity}
            onChange={e => updateSetting("maxVelocity", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <label>
            <span>Sub-Steps</span>
            <span>{settings.subSteps}</span>
          </label>
          <input
            type="range"
            min="1"
            max="4"
            step="1"
            value={settings.subSteps}
            onChange={e => updateSetting("subSteps", Number.parseInt(e.target.value, 10))}
          />
        </div>
      </Section>

      <Section title="Collisions & Merging">
        <div className="pp-physics-control">
          <label>
            <span>Bounce Restitution</span>
            <span>{settings.bounceRestitution.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={settings.bounceRestitution}
            onChange={e => updateSetting("bounceRestitution", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <label>
            <span>Orbital Decay Chance</span>
            <span>{(settings.orbitalDecayChance * 100).toFixed(1)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="0.1"
            step="0.001"
            value={settings.orbitalDecayChance}
            onChange={e => updateSetting("orbitalDecayChance", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <label>
            <span>Merge Threshold</span>
            <span>{settings.mergeThreshold.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={settings.mergeThreshold}
            onChange={e => updateSetting("mergeThreshold", Number.parseFloat(e.target.value))}
          />
        </div>
      </Section>

      <Section title="Explosions">
        <div className="pp-physics-control">
          <label>
            <span>Explosion Threshold</span>
            <span>{settings.explosionThreshold}</span>
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="5"
            value={settings.explosionThreshold}
            onChange={e => updateSetting("explosionThreshold", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <label>
            <span>Shockwave Force</span>
            <span>{settings.shockwaveForce.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="0.5"
            value={settings.shockwaveForce}
            onChange={e => updateSetting("shockwaveForce", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <label>
            <span>Fragment Mass</span>
            <span>{settings.fragmentMass.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={settings.fragmentMass}
            onChange={e => updateSetting("fragmentMass", Number.parseFloat(e.target.value))}
          />
        </div>
      </Section>

      <Section title="Interactions">
        <div className="pp-physics-control">
          <label>
            <span>Cursor Force</span>
            <span>{settings.cursorMass}</span>
          </label>
          <input
            type="range"
            min="10"
            max="1000"
            step="10"
            value={settings.cursorMass}
            onChange={e => updateSetting("cursorMass", Number.parseFloat(e.target.value))}
          />
        </div>

        <div className="pp-physics-control">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Cursor Mode</span>
            <Select
              value={settings.cursorMode}
              options={[
                { value: "mixed", label: "Mixed (Pull/Repel)" },
                { value: "gravity", label: "Gravity (Pull)" },
                { value: "repel", label: "Repel" },
              ]}
              onChange={e =>
                updateSetting("cursorMode", e.target.value as PhysicsSettings["cursorMode"])
              }
              className="pp-physics-select"
              aria-label="Cursor Mode"
            />
          </div>
        </div>

        <div className="pp-physics-control pp-physics-checkbox">
          <label
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              display: "flex",
            }}
          >
            <span>Create Particles on Click</span>
            <input
              type="checkbox"
              checked={settings.createOnClick}
              onChange={e => updateSetting("createOnClick", e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
          </label>
        </div>

        <div className="pp-physics-control pp-physics-checkbox">
          <label
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              display: "flex",
            }}
          >
            <span>Particles Are Alive</span>
            <input
              type="checkbox"
              checked={settings.particlesAreAlive}
              onChange={e => updateSetting("particlesAreAlive", e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
          </label>
        </div>
      </Section>

      <Section title="Visuals">
        <div className="pp-physics-control pp-physics-checkbox">
          <label
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              display: "flex",
            }}
          >
            <span>Audio Visualization</span>
            <input
              type="checkbox"
              checked={settings.audioVisualization}
              onChange={e => updateSetting("audioVisualization", e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
          </label>
        </div>
        <div className="pp-physics-control">
          <label>
            <span>Trail Length</span>
            <span>{settings.trailLength}</span>
          </label>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={settings.trailLength}
            onChange={e => updateSetting("trailLength", Number.parseInt(e.target.value, 10))}
          />
        </div>
      </Section>

      <p className="pp-physics-hint">
        Click and drag particles on the background to manipulate them.
      </p>

      <button
        type="button"
        onClick={resetToDefaults}
        className="btn btn-ghost btn-sm"
        style={{ marginTop: "auto" }}
      >
        Reset to Defaults
      </button>

      <Link
        to="/visualizer"
        className="btn btn-sm"
        style={{ marginTop: "10px", textAlign: "center" }}
      >
        Open Fullscreen Visualizer
      </Link>
    </div>
  );
};

export default PhysicsControls;
