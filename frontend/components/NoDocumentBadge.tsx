import { FilePlus2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Finding } from "@/lib/schemas";

/** No model was asked for this finding because no document was uploaded for the requirement. */
export const isNoDocument = (f: Finding | null | undefined): boolean => !!f && f.provider === "none";

/** Shown instead of "Not found": nothing was uploaded, so nothing was read. */
export function NoDocumentBadge() {
  return (
    <Badge variant="dashed" title="No document has been uploaded for this requirement, so nothing was read.">
      <FilePlus2 className="size-3" aria-hidden />
      No document
    </Badge>
  );
}
