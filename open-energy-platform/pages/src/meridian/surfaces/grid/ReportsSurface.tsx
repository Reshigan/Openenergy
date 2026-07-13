// Repointed to the canonical section-based report renderer (see ../RoleReportSurface).
// Prior bespoke config pointed at report endpoints that never existed → 404 body.
import RoleReportSurface from '../RoleReportSurface';
export default function ReportsSurface({ role }: { role: string }) {
  return <RoleReportSurface role={role} />;
}
