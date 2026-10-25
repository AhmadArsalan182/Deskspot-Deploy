import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import Alert from "../components/Alert.jsx";
import BookingStatusBadge from "../components/BookingStatusBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { cancelBooking, getMyBookings } from "../services/bookings.js";
import { formatDayKey } from "../utils/date.js";

const SCOPES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export default function BookingsPage() {
  const [scope, setScope] = useState("upcoming");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    let active = true;
    getMyBookings({ scope, pageSize: 50 })
      .then((data) => {
        if (active) setBookings(data.items);
      })
      .catch((err) => {
        if (active) {
          setBookings([]);
          setMessage({ type: "error", text: err.message });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, reloadToken]);

  async function handleCancel(booking) {
    if (!window.confirm(`Cancel your booking for ${booking.space.name} on ${formatDayKey(booking.date)}?`)) return;
    setCancellingId(booking.id);
    setMessage(null);
    try {
      await cancelBooking(booking.id);
      setMessage({ type: "success", text: "Booking cancelled." });
      reload();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setCancellingId(null);
    }
  }

  const canCancel = (booking) => booking.status === "ACTIVE" && new Date(booking.startUtc) > new Date();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="My bookings"
        title="Your reservations"
        subtitle="Everything you booked, in office-local time."
        actions={
          <Link to="/search" className="btn btn--primary">
            <CalendarDays size={18} aria-hidden="true" /> New booking
          </Link>
        }
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      <div className="chip-row" role="tablist" aria-label="Booking scope">
        {SCOPES.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={scope === item.value}
            className={scope === item.value ? "chip chip--active" : "chip"}
            onClick={() => setScope(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading bookings…</p>
      ) : bookings.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No bookings here">
          When you book a desk or room it will appear in this list.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Space</th>
                <th>Office</th>
                <th>When (local)</th>
                <th>Status</th>
                <th className="is-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <div className="cell-strong">{booking.space.name}</div>
                    <SpaceTypeBadge type={booking.space.type} />
                  </td>
                  <td>
                    <div>{booking.office.name}</div>
                    <div className="cell-muted">
                      <MapPin size={12} aria-hidden="true" /> {booking.office.city}
                    </div>
                  </td>
                  <td className="nowrap">
                    <div>{formatDayKey(booking.date)}</div>
                    <div className="cell-muted">
                      {booking.localStartTime}–{booking.localEndTime}
                    </div>
                  </td>
                  <td>
                    <BookingStatusBadge status={booking.status} />
                    {booking.cancelReason && <div className="cell-muted">Reason: {booking.cancelReason}</div>}
                  </td>
                  <td className="is-right">
                    {canCancel(booking) ? (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        disabled={cancellingId === booking.id}
                        onClick={() => handleCancel(booking)}
                      >
                        {cancellingId === booking.id ? "Cancelling…" : "Cancel"}
                      </button>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
