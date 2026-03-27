import React from 'react'

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="card rounded-xl border p-5">
      <h3 className="text-caption mb-4 text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  )
}
