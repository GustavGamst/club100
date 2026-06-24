import tkinter as tk
import csv

CSV_FILE = "links.csv"

def load_links():
    with open(CSV_FILE, newline='', encoding='utf-8') as f:
        return [row["youtube_link"] for row in csv.DictReader(f)]

def save_links(links):
    with open(CSV_FILE, "w", newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["youtube_link"])
        for link in links:
            writer.writerow([link])

def on_drag(event):
    widget = event.widget
    index = widget.nearest(event.y)
    if index != widget.curIndex:
        widget.delete(widget.curIndex)
        widget.insert(index, widget.dragItem)
        widget.curIndex = index

def start_drag(event):
    widget = event.widget
    widget.curIndex = widget.nearest(event.y)
    widget.dragItem = widget.get(widget.curIndex)

def save_and_exit():
    links = listbox.get(0, tk.END)
    save_links(links)
    root.destroy()

def reload_listbox():
    listbox.delete(0, tk.END)
    for link in load_links():
        listbox.insert(tk.END, link)

root = tk.Tk()
root.title("Reorder YouTube Links")

listbox = tk.Listbox(root, width=60)
listbox.pack()

for link in load_links():
    listbox.insert(tk.END, link)

listbox.bind("<Button-1>", start_drag)
listbox.bind("<B1-Motion>", on_drag)

tk.Button(root, text="Save", command=save_and_exit).pack()
tk.Button(root, text="Reload", command=reload_listbox).pack()

root.mainloop()
