from manim import *

class FontTest(Scene):
    def construct(self):
        self.camera.background_color = "#111116"
        fonts = ["Avenir Next", "Futura", "Gill Sans", "Helvetica Neue", "SF Pro Display"]
        y = 2.5
        for font in fonts:
            try:
                t = Text(f"{font}: Manim Skill — Gradient Descent", font_size=28, font=font, color=WHITE)
                t.move_to(UP * y)
                self.add(t)
            except:
                pass
            y -= 1.0
        self.wait(1)
