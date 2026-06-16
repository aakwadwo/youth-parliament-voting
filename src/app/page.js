import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center space-y-8">

          <div className="flex justify-center">
            <div className="h-2 w-16 sm:w-20 bg-[#CF0A0A]" />
            <div className="h-2 w-16 sm:w-20 bg-[#FCD20F]" />
            <div className="h-2 w-16 sm:w-20 bg-[#006B3F]" />
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-semibold text-black tracking-tight leading-tight">
              National Youth Parliament Ghana
            </h1>
            <p className="text-zinc-500 text-base sm:text-lg leading-relaxed">
              The official voting platform for the National Youth Parliament of Ghana elections.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 sm:p-4 space-y-1">
              <p className="text-xl sm:text-2xl font-semibold text-black">275</p>
              <p className="text-xs text-zinc-500">Constituencies</p>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 sm:p-4 space-y-1">
              <p className="text-xl sm:text-2xl font-semibold text-black">18–35</p>
              <p className="text-xs text-zinc-500">Age range</p>
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 sm:p-4 space-y-1">
              <p className="text-xl sm:text-2xl font-semibold text-black">1</p>
              <p className="text-xs text-zinc-500">Vote per person</p>
            </div>
          </div>

          <div className="space-y-3">
            <Link href="/vote" className="block">
              <Button className="w-full bg-black text-white hover:bg-zinc-800 h-12 text-base">
                Register to vote
              </Button>
            </Link>
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full h-12 text-base">
                Already registered? Login
              </Button>
            </Link>
            <p className="text-xs text-zinc-400">
              You will need your full name, date of birth, and phone number.
            </p>
          </div>

          <p className="text-xs text-zinc-300">
            National Youth Parliament of Ghana &copy; {new Date().getFullYear()}
          </p>

        </div>
      </main>
  )
}