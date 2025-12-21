# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - button "Toggle navigation menu" [ref=e4] [cursor=pointer]:
      - img
      - generic [ref=e5]: Toggle navigation menu
    - main [ref=e6]:
      - generic [ref=e8]:
        - generic [ref=e9]:
          - heading "Books(0)" [level=1] [ref=e10]:
            - text: Books
            - generic [ref=e11]: (0)
          - generic [ref=e12]:
            - textbox "Search books by title or author" [ref=e14]:
              - /placeholder: Search by title or author...
            - button "Toggle column visibility" [ref=e15] [cursor=pointer]:
              - img
              - text: Columns
            - button "Add Book" [ref=e16] [cursor=pointer]:
              - img
              - text: Add Book
        - generic [ref=e17]:
          - img [ref=e19]
          - heading "No books yet" [level=3] [ref=e21]
          - paragraph [ref=e22]: Start building your library by adding your first book.
          - button "Add First Book" [ref=e23] [cursor=pointer]
  - generic [ref=e25]:
    - generic [ref=e26]: Cannot read properties of null (reading 'get')
    - button "Close toast" [ref=e27] [cursor=pointer]:
      - img
```