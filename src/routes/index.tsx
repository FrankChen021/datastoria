import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Home</h1>
      <p>Welcome to the home page.</p>
    </div>
  )
}

