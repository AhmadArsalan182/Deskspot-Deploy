import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ChartColumn,
  Gauge,
  MapPin,
  Percent,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Alert from "../components/Alert.jsx";
import BookingStatusBadge from "../components/BookingStatusBadge.jsx";
import { BarChart, DonutChart, LineChart, RankedBars } from "../components/Charts.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { getOverview } from "../services/admin.js";
import { formatDayKey } from "../utils/date.js";

const WINDOWS = [7, 14, 30];
const DESK_COLOR = "#4f46e5";
const ROOM_COLOR = "#0ea5e9";
const OFFICE_COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#a855f7", "#ef4444"];

/** "2026-05-02" → "2 May", for a compact chart axis. */
function shortDay(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function Metric({ icon: Icon, label, value, hint, children }) {
  return (
    <div className="stat stat--icon">
      {Icon && (
        <span className="stat__icon" aria-hidden="true">
          <Icon size={16} />
        </span>
      )}
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {children}
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loadedDays, setLoadedDays] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getOverview({ days })
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
          setLoadedDays(days);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoadedDays(days);
        }
      });
    return () => {
      active = false;
    };
  }, [days]);

  // Derived rather than stored: the figures on screen belong to `loadedDays`,
  // so a window change is "loading" until its own response lands.
  const loading = loadedDays !== days;
  const totals = data?.totals;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Administration"
        title="Company dashboard"
        subtitle="Occupancy, demand and activity across every office."
        actions={
          <div className="chip-row" style={{ marginTop: 0 }}>
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                className={days === window ? "chip chip--active" : "chip"}
                onClick={() => setDays(window)}
              >
                Next {window} days
              </button>
            ))}
          </div>
        }
      />

      {error && <Alert>{error}</Alert>}

      {loading && !data ? (
        <p className="muted">Building your dashboard…</p>
      ) : !data ? null : totals.offices === 0 ? (
        <EmptyState icon={ChartColumn} title="No offices yet">
          Add an office and a few spaces to start collecting figures.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid--4">
            <Metric
              icon={MapPin}
              label="Offices"
              value={totals.offices}
              hint={`${totals.desks} desks · ${totals.rooms} rooms`}
            />
            <Metric
              icon={CalendarDays}
              label={`Bookings · ${data.windowDays}d`}
              value={totals.bookingsInWindow}
              hint={`${totals.cancelledInWindow} cancelled`}
            />
            <Metric
              icon={Gauge}
              label="Occupancy"
              value={`${totals.occupancyTodayPercent}%`}
              hint={`${totals.occupancyInWindowPercent}% over ${data.windowDays} days`}
            >
              <div className="meter" aria-hidden="true">
                <div className="meter__fill" style={{ width: `${Math.min(100, totals.occupancyTodayPercent)}%` }} />
              </div>
            </Metric>
            <Metric
              icon={Users}
              label="People"
              value={totals.employees + totals.admins}
              hint={`${totals.employees} employees · ${totals.admins} admins`}
            />
          </div>

          <div className="grid grid--2">
            <section className="card">
              <div className="card__head">
                <div>
                  <h2>
                    <TrendingUp size={18} aria-hidden="true" /> Booking trend
                  </h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Confirmed bookings per day, next {data.windowDays} days ({data.trendTimezone} buckets).
                  </p>
                </div>
              </div>
              <LineChart
                data={data.trend.map((row) => ({ label: shortDay(row.date), value: row.bookings }))}
                ariaLabel={`Bookings per day over the next ${data.windowDays} days`}
              />
            </section>

            <section className="card">
              <div className="card__head">
                <div>
                  <h2>
                    <Activity size={18} aria-hidden="true" /> Desk vs meeting room
                  </h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Booked slots by space type in the window.
                  </p>
                </div>
              </div>
              <DonutChart
                ariaLabel="Booked slots split between desks and meeting rooms"
                segments={data.spaceTypes.map((row) => ({
                  label: row.type === "ROOM" ? "Meeting rooms" : "Desks",
                  value: row.bookedSlots,
                  color: row.type === "ROOM" ? ROOM_COLOR : DESK_COLOR,
                }))}
              />
            </section>
          </div>

          <section className="card">
            <div className="card__head">
              <div>
                <h2>
                  <Percent size={18} aria-hidden="true" /> Occupancy by office
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  Share of bookable slots filled over the next {data.windowDays} days.
                </p>
              </div>
            </div>
            <BarChart
              ariaLabel="Occupancy percentage by office"
              data={data.officeOccupancy.map((row, index) => ({
                label: row.office.name,
                value: row.occupancyPercent,
                color: OFFICE_COLORS[index % OFFICE_COLORS.length],
              }))}
              formatValue={(value) => `${value}%`}
              showValues
            />
            <div className="table-wrap" style={{ marginTop: 20 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Office</th>
                    <th className="is-right">Active spaces</th>
                    <th className="is-right">Bookings</th>
                    <th className="is-right">Occupancy</th>
                    <th className="is-right">Today</th>
                  </tr>
                </thead>
                <tbody>
                  {data.officeOccupancy.map((row) => (
                    <tr key={row.office.id}>
                      <td>
                        <div className="cell-strong">{row.office.name}</div>
                        <div className="cell-muted">
                          {row.office.city} · {row.office.timezone}
                        </div>
                      </td>
                      <td className="is-right">{row.activeSpaces}</td>
                      <td className="is-right">{row.bookings}</td>
                      <td className="is-right">{row.occupancyPercent}%</td>
                      <td className="is-right">
                        {row.occupancyTodayPercent}%
                        <div className="cell-muted">{row.bookingsToday} bookings</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid--3">
            <section className="card">
              <div className="card__head">
                <h2>
                  <Sparkles size={18} aria-hidden="true" /> Busiest spaces
                </h2>
              </div>
              {data.busiestSpaces.length === 0 ? (
                <p className="muted">No bookings in this window yet.</p>
              ) : (
                <RankedBars
                  ariaLabel="Most booked spaces"
                  data={data.busiestSpaces.map((row) => ({
                    label: row.space.name,
                    value: row.bookedSlots,
                    hint: `${row.office.name} · ${row.bookings} bookings`,
                  }))}
                  formatValue={(value) => `${value} slots`}
                />
              )}
            </section>

            <section className="card">
              <div className="card__head">
                <h2>Next 24 hours</h2>
                <Link to="/admin/bookings" className="btn btn--secondary btn--sm">
                  All bookings
                </Link>
              </div>
              {data.next24Hours.length === 0 ? (
                <p className="muted">Nothing booked in the next 24 hours.</p>
              ) : (
                <ul className="items">
                  {data.next24Hours.map((booking) => (
                    <li key={booking.id}>
                      <div className="item">
                        <div>
                          <div className="item__title">
                            {booking.space.name}
                            <SpaceTypeBadge type={booking.space.type} />
                          </div>
                          <div className="item__meta">
                            <MapPin size={13} aria-hidden="true" /> {booking.office.name} ·{" "}
                            {formatDayKey(booking.date)} · {booking.localStartTime}–{booking.localEndTime}
                          </div>
                        </div>
                        <span className="cell-muted">{booking.user.fullName}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card__head">
                <h2>Recent activity</h2>
              </div>
              {data.recentActivity.length === 0 ? (
                <p className="muted">No bookings recorded yet.</p>
              ) : (
                <ul className="items">
                  {data.recentActivity.map((booking) => (
                    <li key={booking.id}>
                      <div className="item">
                        <div>
                          <div className="item__title">
                            {booking.space.name}
                            <BookingStatusBadge status={booking.status} />
                          </div>
                          <div className="item__meta">
                            {booking.user.fullName} · {formatDayKey(booking.date)} · {booking.localStartTime}–
                            {booking.localEndTime}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
