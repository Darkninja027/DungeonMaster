import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { DESCRIBE_SUBJECTS } from './subjects'
import type { DescribeSubject } from './subjects'
import { NAME_GROUPS, parseNameLists } from './names'
import type { NameGroup } from './names'
import { parseDetails } from './details'

export type DescribeListKind = 'names' | 'details'
type RawLists = Record<DescribeListKind, string | null>

/**
 * App-level key, outside `['worlds', worldId]` for the same reason as
 * templates: these files aren't a world's, and the world layout invalidates
 * that namespace on every file-watcher batch.
 */
export const describeListsKey = ['describeLists'] as const

const NONE: RawLists = { names: null, details: null }

export interface DescribeLists {
  subjects: ReadonlyArray<DescribeSubject>
  nameGroups: ReadonlyArray<NameGroup>
  /** Raw saved text per kind; null means that kind is using the built-ins. */
  raw: RawLists
}

/**
 * What the panel should show for a saved file. A file that parses to nothing
 * (emptied, or written in the wrong shape) falls back to the built-ins rather
 * than leaving the panel blank — the settings page warns about it instead.
 */
export function resolveLists(raw: RawLists): DescribeLists {
  const subjects = raw.details == null ? [] : parseDetails(raw.details)
  const nameGroups = raw.names == null ? [] : parseNameLists(raw.names)
  return {
    subjects: subjects.length > 0 ? subjects : DESCRIBE_SUBJECTS,
    nameGroups: nameGroups.length > 0 ? nameGroups : NAME_GROUPS,
    raw,
  }
}

export function useDescribeLists(): DescribeLists {
  const { data } = useQuery({
    queryKey: describeListsKey,
    queryFn: () => api.describe.get(),
    // Only this app writes the files, so there is nothing to poll for.
    staleTime: Infinity,
    placeholderData: NONE,
  })
  return useMemo(() => resolveLists(data ?? NONE), [data])
}

/** Save one kind, or pass `text: null` to reset it to the built-ins. */
export function useSaveDescribeList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      kind,
      text,
    }: {
      kind: DescribeListKind
      text: string | null
    }) => {
      await api.describe.set(kind, text)
      return { kind, text }
    },
    // Seed rather than invalidate: we know the new value, and a refetch would
    // flash the open panel back to the old lists.
    onSuccess: ({ kind, text }) =>
      queryClient.setQueryData<RawLists>(describeListsKey, (prev) => ({
        ...(prev ?? NONE),
        [kind]: text,
      })),
  })
}
