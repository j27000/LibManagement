import { Errors } from 'cs544-js-utils';

//types defined in library.ts in earlier projects
import * as Lib from 'library-types';


import { NavLinks, LinkedResult, PagedEnvelope, SuccessEnvelope }
  from './response-envelopes.js';

import { makeLibraryWs, LibraryWs } from './library-ws.js';

import { makeElement, makeQueryUrl } from './utils.js';

export default function makeApp(wsUrl: string) {
  return new App(wsUrl);
}



class App {
  private readonly wsUrl: string;
  private readonly ws: LibraryWs;

  private readonly result: HTMLElement;
  private readonly errors: HTMLElement;

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
    this.ws = makeLibraryWs(wsUrl);
    this.result = document.querySelector('#result');
    this.errors = document.querySelector('#errors');

    document.querySelector('#search')!.addEventListener('blur', async (ev) => {
      const element = ev.currentTarget as HTMLInputElement;
      console.log(element)
      const searchUrl = makeQueryUrl(`${this.wsUrl}/api/books`, { search: element.value });
      console.log(searchUrl);
      await this.Search(searchUrl);
    });
  }
  private async Search(url: URL | string) {

    this.clearErrors();
    this.result.innerHTML = '';
    const res = await this.ws.findBooksByUrl(url);
    const envelope = this.unwrap(res);
    if (envelope) {
      this.SearchResults(envelope);
    }
  }

  private SearchResults(envelope: PagedEnvelope<Lib.XBook>) {
    const ul = makeElement('ul', { id: 'search-results' });
    envelope.result.forEach((Book) => {
      const li = makeElement('li', {},
        makeElement('span', { class: 'content' }, Book.result.title),
        makeElement('a', { class: 'details', href: Book.links.self.href }, 'details...')
      );

      li.querySelector('a')!.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await this.showBDetails(Book.links.self.href);
      });

      ul.append(li);
    });

    this.result.append(this.makeScrollSection(envelope.links));
    this.result.append(ul);
    this.result.append(this.makeScrollSection(envelope.links));
  }
  private makeScrollSection(links: NavLinks) {
    const div = makeElement('div', { class: 'scroll' });
    if (links.prev) {
      div.append(makeElement('a', { rel: 'prev', href: links.prev.href }, '<<'));
    }
    if (links.next) {
      div.append(makeElement('a', { rel: 'next', href: links.next.href }, '>>'));
    }
    div.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await this.Search(a.getAttribute('href')!);
      });
    });
    return div;
  }

  private async showBDetails(bookUrl: string) {
    this.clearErrors();
    this.result.innerHTML = '';
    const res = await this.ws.getBookByUrl(bookUrl);
    const envelope = this.unwrap(res);
    if (envelope) {
      this.BDetails(envelope.result);
      this.CheckoutForm(envelope.result.isbn);
    }
  }
  private BDetails(book: Lib.XBook) {
    const dl = makeElement('dl', { class: 'book-details' },
      makeElement('dt', {}, 'ISBN'), makeElement('dd', {}, book.isbn),
      makeElement('dt', {}, 'Title'), makeElement('dd', {}, book.title),
      makeElement('dt', {}, 'Authors'), makeElement('dd', {}, book.authors.join('; ')),
      makeElement('dt', {}, 'Number of Pages'), makeElement('dd', {}, book.pages.toString()),
      makeElement('dt', {}, 'Publisher'), makeElement('dd', {}, book.publisher),
      makeElement('dt', {}, 'Number of Copies'), makeElement('dd', {}, book.nCopies.toString()),
      makeElement('dt', {}, 'Borrowers'), makeElement('dd', { id: 'borrowers' }, 'None')
    );
    this.result.append(dl);
    this.Borrowers(book.isbn);
  }

  private async Borrowers(isbn: string) {
    const res = await this.ws.getLends(isbn);
    console.log("display borrowers:", res);

    if (res.isOk) {
      const borrowersEl = document.querySelector('#borrowers')!;
      borrowersEl.innerHTML = '';

      if (res.val.length === 0) {
        borrowersEl.textContent = 'None';
      } else {
        const ul = makeElement('ul');
        for (const lend of res.val) {
          const li = makeElement('li', {},
            makeElement('span', { class: 'content' }, lend.patronId),
            makeElement('button', { class: 'return-book' }, 'Return Book')
          );

          const returnButton = li.querySelector('button');
          if (returnButton) {
            returnButton.addEventListener('click', async () => {
              await this.ReturnBook(lend);
              await this.Borrowers(isbn);
            });
            console.log("Attached click event listener to the return button");
          }

          ul.append(li);
        }
        borrowersEl.append(ul);
      }
    }
  }

  private CheckoutForm(isbn: string) {
    const form = makeElement('form', { class: 'grid-form', style: 'display: flex; flex-direction: column; align-items: center;' },
      makeElement('label', { for: 'patronId' }, 'Patron ID'),
      makeElement('span', {},
        makeElement('input', { id: 'patronId' }),
        makeElement('br'),
        makeElement('span', { class: 'error', id: 'patronId-error' })
      ),
      makeElement('button', { type: 'submit' }, 'Checkout Book')
    );
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const patronId = (form.querySelector('#patronId') as HTMLInputElement).value;
      await this.Checkout(isbn, patronId);
      await this.Borrowers(isbn);
    });
    this.result.append(form);
  }
  private async Checkout(isbn: string, patronId: string) {
    this.clearErrors();
    const result = await this.ws.checkoutBook({ isbn, patronId });
    if (!result.isOk) {
      if ('errors' in result) {
        displayErrors(result.errors);
      }
    }
  }

  private async ReturnBook(lend: Lib.Lend) {
    this.clearErrors();
    const result = await this.ws.returnBook(lend);
    console.log("do returnBook", result)

    if (!result.isOk) {
      if ('errors' in result) {
        displayErrors(result.errors);
      }
    }
  }





  //TODO: add private methods as needed




  /** unwrap a result, displaying errors if !result.isOk, 
   *  returning T otherwise.   Use as if (unwrap(result)) { ... }
   *  when T !== void.
   */
  private unwrap<T>(result: Errors.Result<T>) {
    if (result.isOk === false) {
      displayErrors(result.errors);
    }
    else {
      return result.val;
    }
  }

  /** clear out all errors */
  private clearErrors() {
    this.errors.innerHTML = '';
    document.querySelectorAll(`.error`).forEach(el => {
      el.innerHTML = '';
    });
  }

} //class App

/** Display errors. If an error has a widget or path widgetId such
 *  that an element having ID `${widgetId}-error` exists,
 *  then the error message is added to that element; otherwise the
 *  error message is added to the element having to the element having
 *  ID `errors` wrapped within an `<li>`.
 */
function displayErrors(errors: Errors.Err[]) {
  for (const err of errors) {
    const id = err.options.widget ?? err.options.path;
    const widget = id && document.querySelector(`#${id}-error`);
    if (widget) {
      widget.append(err.message);
    }
    else {
      const li = makeElement('li', { class: 'error' }, err.message);
      document.querySelector(`#errors`)!.append(li);
    }
  }
}


