export default function Loading() {
  return (
    <div className="container page" aria-busy="true">
      <div className="stack">
        <span className="skel" style={{ width: 240, height: 32 }} />
        <span className="skel" style={{ width: "100%", height: 40 }} />
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="skel"
            style={{ width: "100%", height: 120, borderRadius: 14 }}
          />
        ))}
      </div>
    </div>
  )
}
