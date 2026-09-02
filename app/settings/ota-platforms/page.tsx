import {
  ensureOtaPlatformsIndexes,
  ensureOtaPlatformsSeeded,
  getOtaPlatforms,
} from "@/lib/otaPlatformsStore";
import PageHeader from "@/components/ui/page-header";
import OtaPlatformsManager from "./ota-platforms-manager";

// Reads the current list on every request; cheap, and avoids a stale list
// after an edit.
export const dynamic = "force-dynamic";

export default async function OtaPlatformsPage() {
  await ensureOtaPlatformsIndexes();
  await ensureOtaPlatformsSeeded();
  const platforms = await getOtaPlatforms();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="OTA platforms"
        description={
          <>
            Used on the night report&apos;s OTA bookings section and the OTA
            page. &ldquo;Guest pays platform&rdquo; is just the default for a
            new booking line — reception can flip it per line. Deactivate a
            platform instead of deleting it — past bookings keep referencing
            it.
          </>
        }
        animate
      />
      <OtaPlatformsManager
        platforms={platforms.map((p) => ({
          id: p._id.toString(),
          name: p.name,
          active: p.active,
          displayOrder: p.displayOrder,
          guestPaysPlatform: p.guestPaysPlatform,
        }))}
      />
    </div>
  );
}
