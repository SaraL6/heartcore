// The site's rules and policies. These are plain-language starting points:
// whoever runs a public copy should have them reviewed for where they live.
const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || ''

const Contact = () => CONTACT
  ? <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
  : <em>[the person running this site has not set a contact email yet]</em>

const PAGES: Record<string, { title: string; body: React.ReactNode }> = {
  rules: {
    title: 'community rules',
    body: (
      <>
        <p>heartcore is for collecting pretty, cozy, inspiring things. To keep it that way:</p>
        <ul>
          <li><b>Only post what you may share.</b> Your own photos and art, or things you have permission to post. Credit the creator when you know who it is.</li>
          <li><b>Made by humans.</b> No AI-generated images. This is a place for real photos, real art and real moments.</li>
          <li><b>No nudity or sexual content.</b> None at all involving anyone under 18 — that is reported to the authorities and the account is banned.</li>
          <li><b>No harassment or hate,</b> and no photos of private people posted to mock, expose or target them.</li>
          <li><b>No graphic violence</b> and nothing that promotes self-harm or eating disorders.</li>
          <li><b>No spam,</b> scams or ads.</li>
          <li><b>You must be 13 or older</b> (or the minimum age for online services in your country, if higher).</li>
        </ul>
        <p>See something that breaks these? Open the image and press <b>report</b>. We review reports and remove what breaks the rules; accounts that keep breaking them are closed.</p>
      </>
    ),
  },
  terms: {
    title: 'terms of use',
    body: (
      <>
        <p>By using heartcore you agree to these terms and to the <a className="underline" href="#/about/rules">community rules</a>.</p>
        <h3>Your account</h3>
        <p>You must be at least 13. Keep your password safe; you are responsible for what happens on your account. You can delete your account at any time from your profile.</p>
        <h3>What you post</h3>
        <p>You keep all rights to what you post. You give this site permission to store it and show it to other people here, for as long as it stays posted. You promise that you have the right to post it and that it follows the rules.</p>
        <h3>What we may do</h3>
        <p>We may remove any content and close any account that breaks these terms or the rules, and we close the accounts of people who repeatedly post things that infringe copyright.</p>
        <h3>Photos from elsewhere</h3>
        <p>Photos in Discover come from open photo libraries (Openverse or Unsplash) and belong to their creators. Each one credits its creator and links to its original. Hearting or saving a photo does not give you rights to it.</p>
        <h3>No guarantees</h3>
        <p>This is a free community project, provided as it is, with no promise that it will always be available or that nothing will be lost. To the extent the law allows, the people running it are not liable for losses from using it.</p>
        <h3>Contact</h3>
        <p><Contact /></p>
      </>
    ),
  },
  privacy: {
    title: 'privacy',
    body: (
      <>
        <h3>What we keep</h3>
        <ul>
          <li>Your email address and an encrypted password, to sign you in. Your email is never shown to other people.</li>
          <li>Your username, bio, posts, hearts, collections and who you follow. <b>These are public</b> — that is the point of the site.</li>
          <li>Your theme choice and sign-in session, stored in your browser.</li>
        </ul>
        <h3>What we don't do</h3>
        <p>No ads, no tracking, no selling or sharing your data.</p>
        <h3>Who helps run it</h3>
        <p>Accounts, data and uploads are stored with Supabase. Discover photos are loaded from Openverse, Flickr or Unsplash, which see your IP address when your browser fetches them, as any website does. If you open the music player, it is Spotify's own player and Spotify's privacy policy applies to it; we never see your Spotify account.</p>
        <h3>Your choices</h3>
        <p>You can delete any post, and you can delete your whole account from your profile — that erases your profile, posts, hearts, collections and follows. To ask for a copy of your data or anything else, write to <Contact />.</p>
      </>
    ),
  },
  copyright: {
    title: 'copyright & takedowns',
    body: (
      <>
        <p>If something of yours is here without your permission, we will take it down.</p>
        <p><b>Fastest:</b> open the image and press <b>report</b>, choosing “it's mine and was posted without permission”. You do not need an account.</p>
        <p><b>Or write to</b> <Contact /> with:</p>
        <ul>
          <li>a link to the image on this site;</li>
          <li>what the original work is and where it can be seen;</li>
          <li>your name and a way to reach you;</li>
          <li>a statement that you own it (or act for the owner), that the use is not authorised, and that what you say is accurate.</li>
        </ul>
        <p>If your post was removed by mistake, write to the same address and explain why. People who repeatedly post infringing things lose their accounts.</p>
      </>
    ),
  },
}

export const LEGAL_LINKS: [string, string][] = [['rules', 'rules'], ['terms', 'terms'], ['privacy', 'privacy'], ['copyright', 'copyright']]

export function LegalPage({ page }: { page: string }) {
  const p = PAGES[page] ?? PAGES.rules
  return (
    <article className="legal">
      <h1>{p.title}</h1>
      {p.body}
    </article>
  )
}
