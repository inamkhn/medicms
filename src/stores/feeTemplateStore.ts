// ============================================
// MediCMS Desktop - Fee Template Store
// Component-based templates (design doc §5), stored permanently — §7.8 "Templates are
// stored permanently (not reset on reload)". The old per-semester eight-head rows are
// converted once as the first-run seed.
//
// The rules themselves live in lib/fee/templateRules: this store only keeps the list
// and applies those functions, so no screen can invent its own answer to "which
// template wins", and every refusal (a duplicate Active, activation without a
// terms-per-year value) is reported as a reason the UI can show.
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_FEE_TEMPLATES } from '@/lib/mockData';
import { getCourseOfProgram } from '@/lib/constants';
import { convertLegacyRows } from '@/lib/fee/templateSeed';
import {
  activationBlocker,
  blankTemplate,
  duplicateTemplate,
  findActiveFor,
  nextVersionFor,
  studentsUsing,
  templateIdFor,
  type DuplicateTarget,
  type NewTemplateInput,
  type TemplatePlacement,
} from '@/lib/fee/templateRules';
import type { FeeTemplate, Student, TemplateStatus } from '@/types';

/** Every write goes through here so a rejected save carries the rule that blocked it. */
export type TemplateSaveResult =
  | { ok: true; template: FeeTemplate }
  | { ok: false; reason: string };

function seedTemplates(): FeeTemplate[] {
  return convertLegacyRows(MOCK_FEE_TEMPLATES, { now: new Date().toISOString() });
}

interface FeeTemplateState {
  templates: FeeTemplate[];

  /** The template an admission or a fee screen should use (§7.1, §7.3). */
  findActive: (placement: TemplatePlacement) => FeeTemplate | undefined;
  /** §7.6 - "Used by N students". Students are passed in so this store does not depend on the student store. */
  usedByCount: (id: string, students: readonly Student[]) => number;

  saveTemplate: (draft: FeeTemplate) => TemplateSaveResult;
  createTemplate: (input: Omit<NewTemplateInput, 'now'>) => TemplateSaveResult;
  setStatus: (id: string, status: TemplateStatus) => TemplateSaveResult;
  duplicateToSession: (id: string, target: DuplicateTarget) => TemplateSaveResult;
}

export const useFeeTemplateStore = create<FeeTemplateState>()(
  persist(
    (set, get) => {
      const replace = (template: FeeTemplate) => {
        const exists = get().templates.some((t) => t.id === template.id);
        set((state) => ({
          templates: exists
            ? state.templates.map((t) => (t.id === template.id ? template : t))
            : [...state.templates, template],
        }));
      };

      return {
        templates: seedTemplates(),

        findActive: (placement) => findActiveFor(get().templates, placement),

        usedByCount: (id, students) => {
          const template = get().templates.find((t) => t.id === id);
          return template ? studentsUsing(template, students) : 0;
        },

        saveTemplate: (draft) => {
          // The id always says which placement the template covers, so editing that
          // placement moves the row instead of leaving a stale id behind — and a second
          // template for the same placement is refused here, not discovered later.
          const id = templateIdFor(draft.program, draft.batch, draft.session);
          const clash = get().templates.find((t) => t.id === id && t.id !== draft.id);
          if (clash) {
            return {
              ok: false,
              reason: `"${clash.name}" already covers that placement (v${clash.version}). Edit it instead of starting a second one (§7.2).`,
            };
          }

          const existing = get().templates.find((t) => t.id === draft.id);
          // §7.9 - an Active template that changes content raises its version; a Draft
          // stays where it is, so reviewing a draft does not look like a re-price.
          const template: FeeTemplate = {
            ...draft,
            id,
            // A program belongs to exactly one course, so course is derived, never stored
            // out of step with the program.
            course: getCourseOfProgram(draft.program),
            version: nextVersionFor(existing, draft),
            updatedAt: new Date().toISOString(),
          };

          if (template.status === 'Active') {
            const blocker = activationBlocker(
              template,
              get().templates.filter((t) => t.id !== template.id && t.id !== draft.id),
            );
            if (blocker) return { ok: false, reason: blocker };
          }

          set((state) => {
            const replacing = state.templates.some((t) => t.id === draft.id);
            return {
              templates: replacing
                ? state.templates.map((t) => (t.id === draft.id ? template : t))
                : [...state.templates, template],
            };
          });
          return { ok: true, template };
        },

        createTemplate: (input) => {
          const template = blankTemplate({ ...input, now: new Date().toISOString() });
          if (get().templates.some((t) => t.id === template.id)) {
            return {
              ok: false,
              reason: `A template already exists for that placement (${templateIdFor(input.program, input.batch, input.session)}). Edit it instead of starting a second one.`,
            };
          }
          set((state) => ({ templates: [...state.templates, template] }));
          return { ok: true, template };
        },

        setStatus: (id, status) => {
          const template = get().templates.find((t) => t.id === id);
          if (!template) return { ok: false, reason: 'That template no longer exists.' };

          if (status === 'Active') {
            const blocker = activationBlocker(template, get().templates.filter((t) => t.id !== id));
            if (blocker) return { ok: false, reason: blocker };
          }

          // A status change is not a content change, so the version is left alone (§7.9).
          const updated: FeeTemplate = { ...template, status, updatedAt: new Date().toISOString() };
          replace(updated);
          return { ok: true, template: updated };
        },

        duplicateToSession: (id, target) => {
          const source = get().templates.find((t) => t.id === id);
          if (!source) return { ok: false, reason: 'That template no longer exists.' };

          const copy = duplicateTemplate(source, target, new Date().toISOString());
          if (get().templates.some((t) => t.id === copy.id)) {
            return { ok: false, reason: `There is already a template for ${copy.name}.` };
          }
          set((state) => ({ templates: [...state.templates, copy] }));
          return { ok: true, template: copy };
        },
      };
    },
    {
      name: 'medicms-fee-templates',
      partialize: (state) => ({ templates: state.templates }),
    },
  ),
);
