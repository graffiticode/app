import Head from 'next/head'
import Image from 'next/image';
import { useDispatch, useSelector } from 'react-redux'
import { useSession, signIn } from 'next-auth/react'
import { Fragment, useState } from 'react'
import { Disclosure, Menu, Dialog, Transition } from '@headlessui/react'
import {
  CalendarIcon,
  CashIcon,
  ChartBarIcon,
  FolderIcon,
  HomeIcon,
  InboxIcon,
  Bars3Icon,
  UsersIcon,
  XMarkIcon,
  BellIcon,
} from '@heroicons/react/24/outline'
import SignIn from '../components/signin'
import { useEffect } from 'react';
import { loadTasks, updateMark, updateLang } from '../utils/redux/actions';
import Link from 'next/link';
import Gallery from '../components/gallery';
import LanguageSelector from '../components/language-selector';
import MarkSelector, { marks } from '../components/mark-selector';
import useSwr from 'swr';
import { tasksSettings } from '../utils/swr/fetchers';

export function Logo(props) {
  return (
    <Image src='/logo.png' alt='Artcompiler logo' width='30' height='30' />
  )
}

const navigation = [
  { name: 'Home', href: '/', current: false },
  { name: 'Tasks', href: '/tasks', current: true },
  { name: 'Settings', href: '/settings', current: false },
];

const userNavigation = [
  { name: 'Your Profile', href: '#' },
  { name: 'Settings', href: '#' },
  { name: 'Sign out', href: '#' },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

/*

  Get 'language' and 'mark' from redux. When it changes save it to redux.
  Also, store it in state for quick access.
  
  TODO
  [ ] Re-load tasks when lang or mark is changed
*/

export default function Tasks() {
  const dispatch = useDispatch()
  const [language, setLanguage] = useState({id: 1, name: 'L1'})
  const [mark, setMark] = useState(marks[0])
  const lang = language.name.slice(1);
  const uid = useSelector(state => state.userId);
  //const resp = useSwr({uid, lang, mark: mark.id}, tasksSettings);
  //console.log("Tasks() resp=" + JSON.stringify(resp.data));
  return (
    <>
      {/*
        This example requires updating your template:

        ```
        <html class="h-full bg-gray-100">
        <body class="h-full">
        ```
      */}
      <Head>
        <title>Graffiticode</title>
        <link rel="icon" type="image/png" href="favicon.png" />
        <meta
          name="description"
          content="A software studio"
        />
      </Head>
      <div className="min-h-full">
        <Disclosure as="nav" className="bg-gray-800">
          {({ open }) => (
            <>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Logo />
                    </div>
                    <div className="hidden md:block">
                      <div className="ml-10 flex items-baseline space-x-4">
                        {navigation.map((item) => (
                          <a
                            key={item.name}
                            href={item.href}
                            target={item.target}
                            className={classNames(
                              item.current
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                              'px-3 py-2 rounded-none text-sm font-medium'
                            )}
                            aria-current={item.current ? 'page' : undefined}
                          >
                            {item.name}
                          </a>
                        ))}
                      </div>
                    </div>
                    <div className="ml-10 flex-shrink-0 w-24 h-24 pt-7">
                      <LanguageSelector language={language} setLanguage={setLanguage} />
                    </div>
                    <div className="ml-4 flex-shrink-0 w-18 h-24 pt-7">
                      <MarkSelector mark={mark} setMark={setMark}/>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="text-sm font-medium ml-4 flex items-center md:ml-6 text-gray-400 hover:text-white">
                      <button
                        type="button"
                        className="bg-gray-800 p-1 rounded-none text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                      >
                        <span className="sr-only">View notifications</span>
                        <BellIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                      <SignIn />
                      {/* Profile dropdown
                      <Menu as="div" className="ml-3 relative">
                        <div>
                          <Menu.Button className="max-w-xs bg-gray-800 rounded-none flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white">
                          <span className="sr-only">Open user menu</span>
                          <img className="h-8 w-8 rounded-none" src={user.imageUrl} alt="" />
                        </Menu.Button>
                        </div>
                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="origin-top-right absolute right-0 mt-2 w-48 rounded-none shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                            {userNavigation.map((item) => (
                              <Menu.Item key={item.name}>
                                {({ active }) => (
                                  <a
                                    href={item.href}
                                    className={classNames(
                                      active ? 'bg-gray-100' : '',
                                      'block px-4 py-2 text-sm text-gray-700'
                                    )}
                                  >
                                    {item.name}
                                  </a>
                                )}
                              </Menu.Item>
                            ))}
                          </Menu.Items>
                        </Transition>
                      </Menu>
                      */}
                    </div>
                  </div>
                  <div className="-mr-2 flex md:hidden">
                    {/* Mobile menu button */}
                    <Disclosure.Button className="bg-gray-800 inline-flex items-center justify-center p-2 rounded-none text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white">
                      <span className="sr-only">Open main menu</span>
                      {open ? (
                        <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                      ) : (
                        <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                      )}
                    </Disclosure.Button>
                  </div>
                </div>
              </div>

              <Disclosure.Panel className="md:hidden">
                <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                  {navigation.map((item) => (
                    <Disclosure.Button
                      key={item.name}
                      as="a"
                      href={item.href}
                      className={classNames(
                        item.current ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                        'block px-3 py-2 rounded-none text-base font-medium'
                      )}
                      aria-current={item.current ? 'page' : undefined}
                    >
                      {item.name}
                    </Disclosure.Button>
                  ))}
                </div>
                <div className="pt-4 pb-3 border-t border-gray-700">
                  <div className="flex items-center px-5 text-gray-400 hover:text-white">
                    {/*
                    <div className="flex-shrink-0">
                      <img className="h-10 w-10 rounded-none" src={user.imageUrl} alt="" />
                    </div>
                    <div className="ml-3">
                      <div className="text-base font-medium leading-none text-white">{user.name}</div>
                      <div className="text-sm font-medium leading-none text-gray-400">{user.email}</div>
                    </div>
                    */}
                    <SignIn />
                    <button
                      type="button"
                      className="ml-auto bg-gray-800 flex-shrink-0 p-1 rounded-none text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                    >
                      <span className="sr-only">View notifications</span>
                      <BellIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  {/*
                  <div className="mt-3 px-2 space-y-1">
                    {userNavigation.map((item) => (
                      <Disclosure.Button
                        key={item.name}
                        as="a"
                        href={item.href}
                        className="block px-3 py-2 rounded-none text-base font-medium text-gray-400 hover:text-white hover:bg-gray-100"
                      >
                        {item.name}
                      </Disclosure.Button>
                    ))}
                  </div>
                  */}
                </div>
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>

        {/*
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          </div>
        </header>
        */}
        <main>
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Gallery lang={lang} mark={mark}/>
          </div>
        </main>
      </div>
    </>
  )
}
