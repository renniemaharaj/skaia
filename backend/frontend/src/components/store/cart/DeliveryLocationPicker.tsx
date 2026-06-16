import { MapPin, Phone } from "lucide-react";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
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
  deliveryDate: string;
  deliveryLocation: string;
  deliveryMarkerPosition: [number, number] | null;
  deliveryTime: string;
  extraInfo: string;
  guestPhone: string;
  referralCode: string;
  onDeliveryDateChange: (value: string) => void;
  onDeliveryLocationChange: (value: string) => void;
  onDeliveryTimeChange: (value: string) => void;
  onExtraInfoChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  onReferralCodeChange: (value: string) => void;
}

export function DeliveryLocationPicker({
  deliveryDate,
  deliveryLocation,
  deliveryMarkerPosition,
  deliveryTime,
  extraInfo,
  guestPhone,
  referralCode,
  onDeliveryDateChange,
  onDeliveryLocationChange,
  onDeliveryTimeChange,
  onExtraInfoChange,
  onGuestPhoneChange,
  onReferralCodeChange,
}: DeliveryLocationPickerProps) {
  return (
    <div className="cart-summary-section">
      <h4>Delivery</h4>
      <div className="input-group">
        <Phone size={15} />
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9+\-() ]*"
          placeholder="Contact phone number"
          value={guestPhone}
          onChange={event => onGuestPhoneChange(event.target.value)}
        />
      </div>

      <div className="cart-map-container">
        <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <LocationPickerEvents setDeliveryLocation={onDeliveryLocationChange} />
          {deliveryMarkerPosition && <Marker position={deliveryMarkerPosition} />}
        </MapContainer>
      </div>

      <div className="input-group">
        <MapPin size={15} />
        <input
          type="text"
          placeholder="Delivery location (or click map to pin)"
          value={deliveryLocation}
          onChange={event => onDeliveryLocationChange(event.target.value)}
        />
      </div>

      <div className="cart-datetime-row">
        <input
          type="date"
          value={deliveryDate}
          onChange={event => onDeliveryDateChange(event.target.value)}
          title="Delivery Date"
        />
        <input
          type="time"
          value={deliveryTime}
          onChange={event => onDeliveryTimeChange(event.target.value)}
          title="Delivery Time"
        />
      </div>

      <textarea
        className="cart-textarea"
        placeholder="Extra info - gate code, instructions, etc."
        value={extraInfo}
        onChange={event => onExtraInfoChange(event.target.value)}
      />

      <div className="input-group cart-referral-field">
        <input
          type="text"
          placeholder="Referral code (optional)"
          value={referralCode}
          onChange={event => onReferralCodeChange(event.target.value)}
        />
      </div>
    </div>
  );
}
