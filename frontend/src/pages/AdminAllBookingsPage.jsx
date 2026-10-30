import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import Alert from "../components/Alert.jsx";
import BookingStatusBadge from "../components/BookingStatusBadge.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { getAllBookings } from "../services/admin.js";
import { cancelBooking } from "../services/bookings.js";
import { getOffices } from "../services/offices.js";
import { formatDayKey } from "../utils/date.js";

const EMPTY_FILTERS = { officeId: "", date: "", status: "" };
const EMPTY_DATA = { items: [], pagination: { page: 1, totalPages: 1, total: 0 } };

export default function AdminAllBookingsPage() {
  const [offices, setOffices] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingCancel, setPendingCancel] = useState(null);

  const { officeId, date, status } = filters;

  useEffect(() => {
    let active = true;
    getOffices()
      .then((items) => {
        if (active) setOffices(items);
      })
      .catch((err) => {
        if (active) setMessage({ type: "error", text: err.message });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getAllBookings({ officeId, date, status, page, pageSize: 20 })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) {
          setData(EMPTY_DATA);
          setMessage({ type: "error", text: err.message });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [officeId, date, status, page, reloadToken]);

  function updateFilter(patch) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  function requestCancel(booking) {
    setPendingCancel(booking);
  }

  async function confirmCancel(reason) {
    const booking = pendingCancel;
    if (!booking) return;
    setPendingCancel(null);
    setMessage(null);
    try {
      await cancelBooking(booking.id, reason);
      setMessage({ type: "success", text: "Booking cancelled and the employee was notified." });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  const canCancel = (booking) => booking.status === "ACTIVE" && new Date(booking.startUtc) > new Date();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Administration"
        title="All bookings"
        subtitle="Every reservation across all offices, optionally filtered by day."
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      <div className="card">
        <div className="toolbar">
          <div className="field field--inline" style={{ flex: "1 1 220px" }}>
            <label htmlFor="filter-office">Office</label>
            <select
              id="filter-office"
              value={filters.officeId}
              onChange={(event) => updateFilter({ officeId: event.target.value })}
            >
              <option value="">All offices</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field field--inline" style={{ flex: "1 1 190px" }}>
            <label htmlFor="filter-date">Date</label>
            <input
              id="filter-date"
              type="date"
              value={filters.date}
              onChange={(event) => updateFilter({ date: event.target.value })}
            />
          </div>
          <div className="field field--inline" style={{ flex: "1 1 190px" }}>
            <label htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(event) => updateFilter({ status: event.target.value })}
            >
              <option value="">Any</option>
              <option value="ACTIVE">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <button type="button" className="btn btn--secondary" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading bookings…</p>
      ) : data.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No bookings match these filters">
          Change the office, date or status to see other reservations.
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Space</th>
                  <th>Office</th>
                  <th>When (local)</th>
                  <th>Status</th>
                  <th className="is-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <div className="cell-strong">{booking.user.fullName}</div>
                      <div className="cell-muted">{booking.user.email}</div>
                    </td>
                    <td>
                      <div>{booking.space.name}</div>
                      <SpaceTypeBadge type={booking.space.type} />
                    </td>
                    <td>
                      <div>{booking.office.name}</div>
                      <div className="cell-muted">{booking.office.city}</div>
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
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => requestCancel(booking)}>
                          Cancel
                        </button>
                      ) : (
                        <span className="cell-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar">
            <span className="muted">
              Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} bookings
            </span>
            <div className="toolbar__spacer" />
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title="Cancel booking"
        message={
          pendingCancel
            ? `Cancel ${pendingCancel.user.fullName}'s booking for ${pendingCancel.space.name}? The employee will be notified with your reason.`
            : ""
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        danger
        requireReason
        reasonLabel="Cancellation reason"
        reasonPlaceholder="Explain why this booking is being cancelled"
        onCancel={() => setPendingCancel(null)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
