import { useFooterSettings } from '../context/FooterSettingsContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';

type Section = { heading: string; paragraphs?: string[]; bullets?: string[] };
type Policy = { notice: string; title: string; effective: string; intro: string; sections: Section[]; contact: string };

const english: Policy = {
  notice: 'Personal Data Protection Notice',
  title: 'Privacy Policy',
  effective: 'Effective date: 25 August 2026',
  intro: 'respects your privacy. This policy explains how we collect, use, retain and disclose personal data when you use our website, place an order or contact us. We process personal data for commercial transactions in accordance with Malaysia’s Personal Data Protection Act 2010 (PDPA / Act 709).',
  sections: [
    { heading: '1. Personal data we collect', paragraphs: ['We collect only the data reasonably necessary to provide FreshGo’s services. Depending on how you use FreshGo, this may include:'], bullets: ['your name, email address, telephone number and account details;', 'delivery address, unit number, delivery or collection point, requested date and time slot;', 'order details, including products, quantity, preparation choices, order notes, price and order history;', 'payment status and the payment receipt you upload; and', 'messages or information you give us by email, WhatsApp or another support channel.'] },
    { heading: '2. Data we do not request and how we use data', paragraphs: ['Please do not provide your identity-card number, full payment-card number, CVV, PIN, password, health information or precise live location unless we specifically ask for it because it is necessary. FreshGo does not need these details for normal ordering.', 'We use personal data to create and manage your account; process, prepare, verify payment for and deliver your order; contact you about an order, final weighed amount, delivery or service issue; provide order history and customer support; prevent fraud and protect our systems; meet legal obligations; and improve our operations using information limited to that purpose.', 'We do not sell personal data.'] },
    { heading: '3. Marketing and your choices', paragraphs: ['FreshGo will send promotional WhatsApp, SMS or email only where you have given a separate, voluntary opt-in. Marketing consent is not a condition of purchasing from us. You may withdraw it at any time by using the unsubscribe instruction in the message or by contacting us. Operational messages about your account, order, payment or delivery are not marketing messages.'] },
    { heading: '4. When we disclose data', paragraphs: ['We disclose only the minimum necessary data, and only for the stated purposes, to:'], bullets: ['authorised FreshGo staff and suppliers preparing your order;', 'assigned riders and delivery providers such as Lalamove, where delivery or collection requires it;', 'technology, hosting, storage, payment and communications providers that help operate our website and service;', 'professional advisers, insurers or authorities where required or permitted by law.'] },
    { heading: '5. Overseas transfers and service providers', paragraphs: ['Some service providers may process data outside Malaysia. Before using a provider for personal data, FreshGo will take reasonable steps to ensure suitable contractual, organisational and technical safeguards are in place and that any transfer complies with applicable law. We require providers to process personal data only for authorised purposes and to protect it appropriately. Their own services may also be governed by their privacy notices.'] },
    { heading: '6. Security, payment data and incidents', paragraphs: ['We use reasonable administrative, technical and access-control safeguards to protect personal data from unauthorised access, loss, misuse, alteration or disclosure. Access is limited according to job role and should be given only through individual authorised accounts. We review access and keep appropriate operational records.', 'FreshGo does not request or store full payment-card numbers or CVVs. We retain only the payment information and transaction evidence needed to verify and administer an order.', 'If a data incident occurs, we will investigate, contain it, preserve incident records and assess notification obligations. We will notify affected people and the relevant authorities where required by applicable law.'] },
    { heading: '7. Retention and data accuracy', paragraphs: ['We keep data only for as long as necessary for the purposes described above, including order fulfilment, customer support, accounting, tax, fraud prevention, dispute resolution and legal compliance. After that, we will delete or anonymise it where appropriate. Please keep your account and delivery details accurate and tell us if they change.'] },
    { heading: '8. Your rights and requests', paragraphs: ['Subject to applicable law, you may request access to your personal data, ask us to correct inaccurate, incomplete or outdated data, withdraw consent for optional processing, opt out of direct marketing, or request deletion where we no longer need to retain the data. We may need to verify your identity and may retain information that must be kept for legal, tax, security or transaction-record purposes.'] },
    { heading: '9. Changes to this policy', paragraphs: ['We may update this policy when our operations or legal obligations change. The current version and its effective date will be published on this page.'] },
  ],
  contact: 'For privacy questions or to make an access, correction, consent-withdrawal or deletion request, email us at',
};

const malay: Policy = {
  notice: 'Notis Perlindungan Data Peribadi',
  title: 'Dasar Privasi',
  effective: 'Tarikh kuat kuasa: 25 Ogos 2026',
  intro: 'menghormati privasi anda. Dasar ini menerangkan cara kami mengumpul, menggunakan, menyimpan dan mendedahkan data peribadi apabila anda menggunakan laman web, membuat pesanan atau berhubung dengan kami. Kami memproses data peribadi bagi urusan komersial mengikut Akta Perlindungan Data Peribadi 2010 (PDPA / Akta 709).',
  sections: [
    { heading: '1. Data peribadi yang kami kumpulkan', paragraphs: ['Kami hanya mengumpulkan data yang munasabah dan perlu untuk menyediakan perkhidmatan FreshGo. Bergantung pada cara anda menggunakan FreshGo, data ini mungkin termasuk:'], bullets: ['nama, alamat e-mel, nombor telefon dan butiran akaun anda;', 'alamat penghantaran, nombor unit, titik serahan atau kutipan, tarikh dan slot masa yang diminta;', 'butiran pesanan, termasuk produk, kuantiti, pilihan penyediaan, nota pesanan, harga dan sejarah pesanan;', 'status bayaran serta resit pembayaran yang anda muat naik; dan', 'mesej atau maklumat yang anda berikan melalui e-mel, WhatsApp atau saluran sokongan lain.'] },
    { heading: '2. Data yang tidak kami minta dan cara data digunakan', paragraphs: ['Jangan berikan nombor kad pengenalan, nombor kad pembayaran penuh, CVV, PIN, kata laluan, maklumat kesihatan atau lokasi langsung yang tepat melainkan kami memintanya secara khusus kerana perlu. FreshGo tidak memerlukan data tersebut untuk pesanan biasa.', 'Kami menggunakan data peribadi untuk mewujudkan dan mengurus akaun; memproses, menyediakan, mengesahkan bayaran dan menghantar pesanan; menghubungi anda berkenaan pesanan, jumlah akhir item yang ditimbang, penghantaran atau isu perkhidmatan; menyediakan sejarah pesanan dan sokongan; mencegah penipuan serta melindungi sistem; mematuhi kewajipan undang-undang; dan menambah baik operasi menggunakan maklumat yang terhad kepada tujuan tersebut.', 'Kami tidak menjual data peribadi.'] },
    { heading: '3. Pemasaran dan pilihan anda', paragraphs: ['FreshGo hanya akan menghantar promosi melalui WhatsApp, SMS atau e-mel apabila anda memberikan persetujuan opt-in yang berasingan dan sukarela. Persetujuan pemasaran bukan syarat untuk membeli daripada kami. Anda boleh menarik balik persetujuan pada bila-bila masa melalui arahan berhenti langgan dalam mesej atau dengan menghubungi kami. Mesej operasi berkenaan akaun, pesanan, bayaran atau penghantaran bukan mesej pemasaran.'] },
    { heading: '4. Bila data didedahkan', paragraphs: ['Kami hanya mendedahkan data minimum yang perlu dan bagi tujuan yang dinyatakan kepada:'], bullets: ['staf FreshGo dan pembekal yang dibenarkan untuk menyediakan pesanan;', 'rider yang ditugaskan dan penyedia penghantaran seperti Lalamove, apabila penghantaran atau kutipan memerlukannya;', 'penyedia teknologi, hosting, storan, pembayaran dan komunikasi yang membantu mengendalikan laman web serta perkhidmatan kami; dan', 'penasihat profesional, syarikat insurans atau pihak berkuasa apabila dikehendaki atau dibenarkan undang-undang.'] },
    { heading: '5. Pemindahan luar negara dan penyedia perkhidmatan', paragraphs: ['Sesetengah penyedia perkhidmatan mungkin memproses data di luar Malaysia. Sebelum menggunakan penyedia bagi data peribadi, FreshGo akan mengambil langkah munasabah untuk memastikan perlindungan kontrak, organisasi dan teknikal yang sesuai tersedia serta pemindahan mematuhi undang-undang. Kami mewajibkan penyedia memproses data hanya bagi tujuan yang dibenarkan dan melindunginya dengan sewajarnya. Perkhidmatan mereka juga mungkin tertakluk pada notis privasi mereka sendiri.'] },
    { heading: '6. Keselamatan, data bayaran dan insiden', paragraphs: ['Kami menggunakan perlindungan pentadbiran, teknikal dan kawalan akses yang munasabah untuk melindungi data peribadi daripada akses, kehilangan, penyalahgunaan, pengubahan atau pendedahan tanpa kebenaran. Akses dihadkan mengikut peranan kerja dan sepatutnya hanya melalui akaun individu yang dibenarkan. Kami menyemak akses serta menyimpan rekod operasi yang sesuai.', 'FreshGo tidak meminta atau menyimpan nombor kad pembayaran penuh atau CVV. Kami hanya menyimpan maklumat bayaran dan bukti transaksi yang perlu untuk mengesahkan serta menguruskan pesanan.', 'Jika berlaku insiden data, kami akan menyiasat, membendungnya, menyimpan rekod insiden dan menilai kewajipan pemberitahuan. Kami akan memaklumkan individu terjejas serta pihak berkuasa berkaitan apabila dikehendaki undang-undang.'] },
    { heading: '7. Tempoh simpanan dan ketepatan data', paragraphs: ['Kami menyimpan data hanya selama yang perlu untuk tujuan di atas, termasuk pemenuhan pesanan, sokongan pelanggan, perakaunan, cukai, pencegahan penipuan, penyelesaian pertikaian dan pematuhan undang-undang. Selepas itu, kami akan memadamkan atau menyahnamakan data apabila sesuai. Sila pastikan butiran akaun dan penghantaran anda tepat serta maklumkan kami jika ia berubah.'] },
    { heading: '8. Hak dan permintaan anda', paragraphs: ['Tertakluk kepada undang-undang yang berkenaan, anda boleh meminta akses kepada data peribadi, meminta kami membetulkan data yang tidak tepat, tidak lengkap atau tidak terkini, menarik balik persetujuan bagi pemprosesan pilihan, berhenti daripada pemasaran langsung, atau meminta pemadaman apabila kami tidak lagi perlu menyimpan data tersebut. Kami mungkin perlu mengesahkan identiti anda dan boleh menyimpan maklumat yang wajib disimpan untuk tujuan undang-undang, cukai, keselamatan atau rekod transaksi.'] },
    { heading: '9. Perubahan kepada dasar ini', paragraphs: ['Kami boleh mengemas kini dasar ini apabila operasi atau kewajipan undang-undang berubah. Versi semasa dan tarikh kuat kuasanya akan diterbitkan pada halaman ini.'] },
  ],
  contact: 'Untuk pertanyaan privasi atau membuat permintaan akses, pembetulan, penarikan persetujuan atau pemadaman, e-mel kami di',
};

export default function PrivacyPolicyPage() {
  const { settings: footer } = useFooterSettings();
  const { settings: website } = useWebsiteSettings();
  const { language } = useLanguage();
  const policy = language === 'en' ? english : malay;
  const email = footer.contact_email || 'hello@rimbunfreshgo.my';
  const contactTitle = language === 'en' ? '10. Contact us' : '10. Hubungi kami';

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="rounded-3xl border border-cream-200 bg-white p-6 shadow-soft sm:p-10">
        <p className="text-sm font-semibold text-jade-700">{policy.notice}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-forest-900 sm:text-4xl">{policy.title} {website.site_name}</h1>
        <p className="mt-3 text-sm text-gray-500">{policy.effective}</p>
        <p className="mt-6 leading-7 text-gray-700"><span className="font-semibold">{website.site_name}</span> {policy.intro}</p>
        <div className="mt-10 space-y-9 text-gray-700">
          {policy.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold text-forest-900">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p className="mt-3 leading-7" key={paragraph}>{paragraph}</p>)}
              {section.bullets && <ul className="mt-3 list-disc space-y-2 pl-6 leading-7">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
            </section>
          ))}
          <section>
            <h2 className="text-xl font-bold text-forest-900">{contactTitle}</h2>
            <p className="mt-3 leading-7">{policy.contact} <a className="font-semibold text-jade-700 underline underline-offset-2" href={'mailto:' + email}>{email}</a>.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
