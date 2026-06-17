import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { MapPin, Phone } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface LocationPickerEventsProps {
  setDeliveryLocation: (location: string) => void;
}

function LocationPickerEvents({ setDeliveryLocation }: LocationPickerEventsProps) {
  useMapEvents({
    click(event) {
      setDeliveryLocation(`${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`);
    },
  });
  return null;
}

interface DeliveryLocationPickerProps {
  deliveryApplicable: boolean;
  deliveryDate: string;
  deliveryLocation: string;
  deliveryMarkerPosition: [number, number] | null;
  deliveryTime: string;
  extraInfo: string;
  guestPhone: string;
  referralCode: string;
  onDeliveryApplicableChange: (value: boolean) => void;
  onDeliveryDateChange: (value: string) => void;
  onDeliveryLocationChange: (value: string) => void;
  onDeliveryTimeChange: (value: string) => void;
  onExtraInfoChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  onReferralCodeChange: (value: string) => void;
}

export function DeliveryLocationPicker({
  deliveryApplicable,
  deliveryDate,
  deliveryLocation,
  deliveryMarkerPosition,
  deliveryTime,
  extraInfo,
  guestPhone,
  referralCode,
  onDeliveryApplicableChange,
  onDeliveryDateChange,
  onDeliveryLocationChange,
  onDeliveryTimeChange,
  onExtraInfoChange,
  onGuestPhoneChange,
  onReferralCodeChange,
}: DeliveryLocationPickerProps) {
  return (
    <div className="cart-summary-section">
      <h4>Order Contact</h4>
      <label className="cart-field cart-field--compact">
        <span className="cart-field-label">Contact phone</span>
        <div className="input-group">
          <Phone size={15} />
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9+\-() ]*"
            placeholder="+1 555 0100"
            value={guestPhone}
            onChange={event => onGuestPhoneChange(event.target.value)}
          />
        </div>
      </label>

      <label className="cart-checkbox-label">
        <input
          type="checkbox"
          checked={deliveryApplicable}
          onChange={event => onDeliveryApplicableChange(event.target.checked)}
        />
        This order needs delivery
      </label>

      {deliveryApplicable && (
        <div className="cart-delivery-fields">
          <div className="cart-map-container">
            <MapContainer
              center={[51.505, -0.09]}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <LocationPickerEvents setDeliveryLocation={onDeliveryLocationChange} />
              {deliveryMarkerPosition && <Marker position={deliveryMarkerPosition} />}
            </MapContainer>
          </div>

          <label className="cart-field">
            <span className="cart-field-label">Delivery location</span>
            <div className="input-group">
              <MapPin size={15} />
              <input
                type="text"
                placeholder="Click map or enter coordinates"
                value={deliveryLocation}
                onChange={event => onDeliveryLocationChange(event.target.value)}
              />
            </div>
          </label>

          <div className="cart-datetime-row">
            <label className="cart-field cart-field--date">
              <span className="cart-field-label">Delivery date</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={event => onDeliveryDateChange(event.target.value)}
                title="Delivery Date"
              />
            </label>
            <label className="cart-field cart-field--time">
              <span className="cart-field-label">Delivery time</span>
              <input
                type="time"
                value={deliveryTime}
                onChange={event => onDeliveryTimeChange(event.target.value)}
                title="Delivery Time"
              />
            </label>
          </div>

          <label className="cart-field">
            <span className="cart-field-label">Delivery notes</span>
            <textarea
              className="cart-textarea"
              placeholder="Gate code, driver instructions, or drop-off details"
              value={extraInfo}
              onChange={event => onExtraInfoChange(event.target.value)}
            />
          </label>
        </div>
      )}

      <label className="cart-field cart-field--code cart-referral-field">
        <span className="cart-field-label">Referral code</span>
        <div className="input-group">
          <input
            type="text"
            placeholder="Optional"
            value={referralCode}
            onChange={event => onReferralCodeChange(event.target.value)}
          />
        </div>
      </label>
    </div>
  );
}
