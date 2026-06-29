import { Settings, Users } from "lucide-react";
import { useAtomValue } from "jotai";
import { useLocation } from "react-router-dom";
import { socketAtom } from "../../../../atoms/auth";
import { voicePermissionsAtom } from "../../../../atoms/voice";
import { sendWebSocketMessage } from "../../../../utils/wsProtobuf";
import { normalizeRoute } from "../../../../utils/route";

export default function AdminSettings() {
  const socket = useAtomValue(socketAtom);
  const permissions = useAtomValue(voicePermissionsAtom);
  const location = useLocation();

  return (
    <div className="ui-panel vp-settings-panel vp-admin-settings">
      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          opacity: 0.6,
          marginBottom: "8px",
          marginTop: "4px",
        }}
      >
        Moderation Controls
      </div>
      <div className="vp-setting-row">
        <span className="vp-setting-label vp-text-error">
          <Settings size={14} />
          Route Voice
        </span>
        <label className="vp-switch">
          <input
            type="checkbox"
            checked={permissions.voiceEnabled}
            onChange={() => {
              if (socket) {
                sendWebSocketMessage(socket, {
                  type: "voice:control",
                  payload: {
                    route: normalizeRoute(location.pathname),
                    action: permissions.voiceEnabled ? "disable" : "enable",
                  },
                });
              }
            }}
          />
          <div className="vp-switch-track vp-switch-track--danger">
            <div className="vp-switch-thumb" />
          </div>
        </label>
      </div>
      <div className="vp-setting-row" style={{ marginTop: "12px" }}>
        <span className="vp-setting-label">
          <Users size={14} />
          Allow Guests
        </span>
        <label className="vp-switch">
          <input
            type="checkbox"
            checked={permissions.guestsAllowed}
            onChange={() => {
              if (socket) {
                sendWebSocketMessage(socket, {
                  type: "voice:control",
                  payload: {
                    route: normalizeRoute(location.pathname),
                    action: permissions.guestsAllowed ? "deny_guests" : "allow_guests",
                  },
                });
              }
            }}
          />
          <div className="vp-switch-track">
            <div className="vp-switch-thumb" />
          </div>
        </label>
      </div>
    </div>
  );
}
