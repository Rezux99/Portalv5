'use client'

import { CompanyDossier } from '@/components/company-dossier'
import type { CompanyPanel as CompanyPanelPayload } from '@/lib/types'

/** Wraps the terminal dossier with the exact same data → identical render. */
export function CompanyPanel({ panel }: { panel: CompanyPanelPayload }) {
  return <CompanyDossier data={panel.payload} />
}