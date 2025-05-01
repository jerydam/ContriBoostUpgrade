import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-center">
        404 - Page Not Found
      </h1>
      <div className="relative w-full max-w-md mb-6">
        <Image
          src="/astronaut.jpg"
          alt="Astronaut lost in space with a speech bubble saying 'Looks like this page is lost in space! Click the rocket to return to Earth (home page)!'"
          width={500}
          height={500}
          className="w-full h-auto object-contain"
          priority
        />
      </div>
      <p className="text-lg text-muted-foreground mb-8 text-center">
        Looks like this page is lost in space! Don’t worry, you can return to Earth.
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        aria-label="Return to home page"
      >
        <span>Click the Rocket to Return Home</span>
        <Image
          src="/rocket.png"
          alt="Rocket icon"
          width={50}
          height={50}
          className="ml-2"
          priority
           /> 
      </Link>
    </div>
  );
}