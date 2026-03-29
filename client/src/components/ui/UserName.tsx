import { Link } from 'react-router-dom'

const FAIRY_QUEEN_ID = 'fairy-queen'

export function UserName({ userId, name }: { userId: string; name: string }) {
  if (userId === FAIRY_QUEEN_ID) {
    return (
      <Link
        to="/fairy-queen"
        className="text-fairy-400 hover:text-fairy-300 hover:underline transition-colors"
      >
        {name}
      </Link>
    )
  }
  return <span>{name}</span>
}
