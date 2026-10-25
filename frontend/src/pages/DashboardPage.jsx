import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, CalendarPlus, CalendarDays, MapPin } from "lucide-react";
import Alert from "../components/Alert.jsx";
import BookingStatusBadge from "../components/BookingStatusBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { getMyBookings } from "../services/bookings.js";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notifications.js";
import { formatDayKey } from "../utils/date.js";

export default function DashboardPage() {
  const { user } = useAuth();
  const [upcoming, setUpcoming] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getMyBookings({ scope: "upcoming", pageSize: 5 }), getNotifications({ pageSize: 6 })])
      .then(([bookings, inbox]) => {
        if (!active) return;
        setUpcoming(bookings.items);
        setNotifications(inbox.items);
        setUnreadCount(inbox.unreadCount);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleMarkRead(id) {
    await markNotificationRead(id);
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome back, ${firstName}`}
        subtitle="Your next bookings and the latest updates from the workplace team."
        actions={
          <Link to="/search" className="btn btn--primary">
            <CalendarPlus size={18} aria-hidden="true" /> Book a space
          </Link>
        }
      />

      {error && <Alert>{error}</Alert>}

      <div className="grid grid--2">
        <section className="card">
          <div className="card__head">
            <h2>Upcoming bookings</h2>
            <Link to="/bookings" className="btn btn--secondary btn--sm">
              View all
            </Link>
          </div>

          {loading ? (
            <p className="muted">Loading your bookings…</p>
          ) : upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing booked yet">
              Use “Book a space” to reserve a desk or meeting room.
            </EmptyState>
          ) : (
            <ul className="items">
              {upcoming.map((booking) => (
                <li key={booking.id}>
                  <div className="item">
                    <div>
                      <div className="item__title">
                        {booking.space.name}
                        <SpaceTypeBadge type={booking.space.type} />
                      </div>
                      <div className="item__meta">
                        <MapPin size={13} aria-hidden="true" /> {booking.office.name} · {formatDayKey(booking.date)} ·{" "}
                        {booking.localStartTime}–{booking.localEndTime}
                      </div>
                    </div>
                    <BookingStatusBadge status={booking.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card__head">
            <h2>Notifications</h2>
            {unreadCount > 0 && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <p className="muted">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <EmptyState icon={BellOff} title="No notifications">
              Booking confirmations and cancellations will show up here.
            </EmptyState>
          ) : (
            <ul className="items">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <div className="item">
                    <div>
                      <div className="item__title">
                        <Bell size={15} aria-hidden="true" />
                        {notification.read ? "Update" : "New update"}
                      </div>
                      <div className="item__meta">{notification.message}</div>
                    </div>
                    {!notification.read && (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => handleMarkRead(notification.id)}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
