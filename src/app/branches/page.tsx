import Settings from '../settings/page'

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function Branches({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  return <Settings searchParams={Promise.resolve({ ...params, section: 'branches' })}/>
}
