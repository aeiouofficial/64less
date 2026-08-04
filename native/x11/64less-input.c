#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern int XTestFakeMotionEvent(Display *, int, int, int, unsigned long);
extern int XTestFakeButtonEvent(Display *, unsigned int, int, unsigned long);
extern int XTestFakeKeyEvent(Display *, unsigned int, int, unsigned long);
extern void XShapeCombineMask(Display *, Window, int, int, int, Pixmap, int);

#define ShapeBounding 0
#define ShapeInput 2
#define ShapeSet 0

static void usage(void) {
  fprintf(stderr, "usage: 64less-input move X Y | click BUTTON | key KEYSYM | type TEXT\n");
  exit(2);
}

static void show_click_ring(Display *display) {
  Window root = DefaultRootWindow(display);
  Window focus;
  int x = 0, y = 0;
  Window child;
  unsigned int mask;
  int root_x, root_y, win_x, win_y;
  XQueryPointer(display, root, &child, &focus, &root_x, &root_y, &win_x, &win_y, &mask);
  x = root_x;
  y = root_y;

  const int size = 44;
  XSetWindowAttributes attrs;
  attrs.override_redirect = True;
  attrs.background_pixel = 0xff3b30;
  Window overlay = XCreateWindow(display, root, x - size / 2, y - size / 2, size, size, 0,
                                 CopyFromParent, InputOutput, CopyFromParent,
                                 CWOverrideRedirect | CWBackPixel, &attrs);

  Pixmap shape = XCreatePixmap(display, overlay, size, size, 1);
  GC gc = XCreateGC(display, shape, 0, NULL);
  XSetForeground(display, gc, 0);
  XFillRectangle(display, shape, gc, 0, 0, size, size);
  XSetForeground(display, gc, 1);
  XFillArc(display, shape, gc, 0, 0, size, size, 0, 360 * 64);
  XSetForeground(display, gc, 0);
  XFillArc(display, shape, gc, 7, 7, size - 14, size - 14, 0, 360 * 64);
  XShapeCombineMask(display, overlay, ShapeBounding, 0, 0, shape, ShapeSet);

  Pixmap input_shape = XCreatePixmap(display, overlay, size, size, 1);
  GC input_gc = XCreateGC(display, input_shape, 0, NULL);
  XSetForeground(display, input_gc, 0);
  XFillRectangle(display, input_shape, input_gc, 0, 0, size, size);
  XShapeCombineMask(display, overlay, ShapeInput, 0, 0, input_shape, ShapeSet);
  XFreeGC(display, input_gc);
  XFreePixmap(display, input_shape);

  XMapRaised(display, overlay);
  XFlush(display);
  usleep(180000);
  XDestroyWindow(display, overlay);
  XFreeGC(display, gc);
  XFreePixmap(display, shape);
}

static void tap(Display *display, KeySym sym, int shift) {
  KeyCode key = XKeysymToKeycode(display, sym);
  if (!key) return;
  KeyCode shift_key = XKeysymToKeycode(display, XK_Shift_L);
  if (shift) XTestFakeKeyEvent(display, shift_key, True, CurrentTime);
  XTestFakeKeyEvent(display, key, True, CurrentTime);
  XTestFakeKeyEvent(display, key, False, CurrentTime);
  if (shift) XTestFakeKeyEvent(display, shift_key, False, CurrentTime);
  XFlush(display);
  usleep(5000);
}

static KeySym character_sym(char c, int *shift) {
  *shift = 0;
  if (c >= 'a' && c <= 'z') return XK_a + (c - 'a');
  if (c >= 'A' && c <= 'Z') { *shift = 1; return XK_a + (c - 'A'); }
  if (c >= '0' && c <= '9') return XK_0 + (c - '0');
  switch (c) {
    case ' ': return XK_space;
    case '.': return XK_period;
    case ',': return XK_comma;
    case '-': return XK_minus;
    case '_': *shift = 1; return XK_minus;
    case '/': return XK_slash;
    case '\\': return XK_backslash;
    case ':': *shift = 1; return XK_semicolon;
    case ';': return XK_semicolon;
    case '=': return XK_equal;
    case '+': *shift = 1; return XK_equal;
    case '@': *shift = 1; return XK_2;
    case '!': *shift = 1; return XK_1;
    default: return NoSymbol;
  }
}

int main(int argc, char **argv) {
  if (argc < 3) usage();
  Display *display = XOpenDisplay(NULL);
  if (!display) {
    fprintf(stderr, "cannot open DISPLAY\n");
    return 1;
  }

  if (!strcmp(argv[1], "move") && argc >= 4) {
    XTestFakeMotionEvent(display, -1, atoi(argv[2]), atoi(argv[3]), CurrentTime);
    XFlush(display);
  } else if (!strcmp(argv[1], "click")) {
    int button = atoi(argv[2]);
    show_click_ring(display);
    XTestFakeButtonEvent(display, button, True, CurrentTime);
    XTestFakeButtonEvent(display, button, False, CurrentTime);
    XFlush(display);
  } else if (!strcmp(argv[1], "key")) {
    KeySym sym = XStringToKeysym(argv[2]);
    if (sym == NoSymbol) usage();
    tap(display, sym, 0);
  } else if (!strcmp(argv[1], "type")) {
    for (const char *p = argv[2]; *p; p++) {
      int shift = 0;
      KeySym sym = character_sym(*p, &shift);
      if (sym != NoSymbol) tap(display, sym, shift);
    }
  } else {
    usage();
  }

  XCloseDisplay(display);
  return 0;
}
