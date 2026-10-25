import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import Alert from "../components/Alert.jsx";
import BookingStatusBadge from "../components/BookingStatusBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { getOccupancy } from "../services/admin.js";
import { cancelBooking } from "../services/bookings.js";
import { getOffices } from "../services/offices.js";
import { formatDayKey, todayKey } from "../utils/date.js";

export default function AdminOccupancyPage() {
  const [offices, setOffices] = useState([]);
  const [officeId, setOfficeId] = useState("");
  const [date, setDate] = useState(todayKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    getOffices()
      .then((items) => {
        if (!active) return;
        setOffices(items);
        setOfficeId((current) => current || items[0]?.id || "");
      })
      .catch((err) => {
        if (active) setMessage({ type: "error", text: err.message });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!officeId) return undefined;
    let active = true;
    getOccupancy({ officeId, date })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) {
          setData(null);
          setMessage({ type: "error", text: err.message });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [officeId, date, reloadToken]);

  async function handleCancel(booking) {
    const reason = window.prompt(`Reason for cancelling the booking for ${booking.space.name}? (required)`);
    if (reason === null) return;
    setMessage(null);
    try {
      await cancelBooking(booking.id, reason);
      setMessage({ type: "success", text: "Booking cancelled and the employee was notified." });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Administration"
        title="Daily occupancy"
        subtitle="See who is where for a chosen day, and free up a space when plans change."
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      <div className="card">
        <div className="toolbar">
          <div className="field field--inline" style={{ flex: "1 1 240px" }}>
            <label htmlFor="occupancy-office">Office</label>
            <select
              id="occupancy-office"
              value={officeId}
              onChange={(event) => {
                setMessage(null);
                setOfficeId(event.target.value);
              }}
            >
              <option value="">Select an office</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name} ({office.city})
                </option>
              ))}
            </select>
          </div>
          <div className="field field--inline" style={{ flex: "0 1 200px" }}>
            <label htmlFor="occupancy-date">Date</label>
            <input
              id="occupancy-date"
              type="date"
              value={date}
              onChange={(event) => {
                setMessage(null);
                setDate(event.target.value);
              }}
            />
          </div>
        </div>
      </div>

      {loading && <p className="muted">Loading occupancy…</p>}

      {!loading && data && (
        <>
          <div className="grid grid--4">
            <div className="stat">
              <div className="stat__label">Office</div>
              <div className="stat__value" style={{ fontSize: "1.15rem" }}>{data.office.name}</div>
              <div className="stat__hint">{formatDayKey(data.date)} · {data.openTime}–{data.closeTime}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Occupancy</div>
              <div className="stat__value">{data.totals.occupancyPercent}%</div>
              <div className="meter" aria-hidden="true">
                <div className="meter__fill" style={{ width: `${Math.min(100, data.totals.occupancyPercent)}%` }} />
              </div>
              <div className="stat__hint">
                {data.totals.bookedSlots} of {data.totals.capacitySlots} slots
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">Bookings</div>
              <div className="stat__value">{data.totals.bookings}</div>
              <div className="stat__hint">confirmed today</div>
            </div>
            <div className="stat">
              <div className="stat__label">Active spaces</div>
              <div className="stat__value">{data.totals.activeSpaces}</div>
              <div className="stat__hint">desks and rooms</div>
            </div>
          </div>

          {data.spaces.length === 0 ? (
            <EmptyState icon={LayoutGrid} title="This office has no spaces">
              Add spaces from the Spaces screen.
            </EmptyState>
          ) : (
            <>
            <section className="card">
              <div className="card__head">
                <h2>Floor view</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Green tiles are free all day. Amber tiles have at least one booking.
                </p>
              </div>
              <div className="floor-map" role="list">
                {data.spaces.map((space) => {
                  const busy = space.bookings.length > 0;
                  const state = !space.isActive ? "inactive" : busy ? "busy" : "free";
                  return (
                    <article
                      key={space.id}
                      role="listitem"
                      className={`floor-tile floor-tile--${state}${space.type === "ROOM" ? " floor-tile--room" : ""}`}
                    >
                      <div className="floor-tile__name">{space.name}</div>
                      <SpaceTypeBadge type={space.type} />
                      <div className="floor-tile__status">
                        {state === "inactive"
                          ? "Inactive"
                          : busy
                            ? `${space.bookings.length} booking${space.bookings.length === 1 ? "" : "s"}`
                            : "Free all day"}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Space</th>
                    <th>Type</th>
                    <th>Booked intervals (local)</th>
                    <th className="is-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spaces.map((space) => (
                    <tr key={space.id}>
                      <td>
                        <div className="cell-strong">{space.name}</div>
                        {!space.isActive && <span className="badge badge--muted">Inactive</span>}
                      </td>
                      <td>
                        <SpaceTypeBadge type={space.type} />
                      </td>
                      <td>
                        {space.bookings.length === 0 ? (
                          <span className="cell-muted">Free all day</span>
                        ) : (
                          <ul className="items">
                            {space.bookings.map((booking) => (
                              <li key={booking.id} className="item">
                                <div>
                                  <div className="item__title">
                                    {booking.localStartTime}–{booking.localEndTime}
                                    <BookingStatusBadge status={booking.status} />
                                  </div>
                                  <div className="item__meta">
                                    {booking.user.fullName} · {booking.attendees}{" "}
                                    {booking.attendees === 1 ? "person" : "people"}
                                  </div>
                                </div>
                                {new Date(booking.startUtc) > new Date() && (
                                  <button
                                    type="button"
                                    className="btn btn--danger btn--sm"
                                    onClick={() => handleCancel(booking)}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="is-right cell-muted">{space.capacity} seats</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
