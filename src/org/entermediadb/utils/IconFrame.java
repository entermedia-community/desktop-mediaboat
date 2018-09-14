package org.entermediadb.utils;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.Vector;
import javax.swing.*;
import javax.swing.border.EmptyBorder;

public class IconFrame
{

	    public static BufferedImage getImage(int size, Color color) {
	        BufferedImage i = new BufferedImage(
	                size, size, BufferedImage.TYPE_INT_RGB);

	        Graphics2D g = i.createGraphics();

	        g.setColor(color);
	        g.fillRect(0, 0, size, size);
	        g.setColor(Color.BLACK);
	        int off = (size>17 ? 3 : 1);
	        if (off>1) g.drawRect(0, 0, size-1, size-1);
	        g.drawString("" + size, off, size-off);

	        g.dispose();

	        return i;
	    }

	    public static void main(String[] args) {
	        final Color[] colors = {
	            Color.GREEN,
	            Color.RED,
	            Color.YELLOW,
	            Color.WHITE,
	            Color.CYAN,
	            Color.MAGENTA,
	            Color.PINK,
	            Color.ORANGE
	        };

	        int s = 64;
	        final int[] sizes = new int[s];

	        for (int ii=0; ii<sizes.length; ii++) {
	            sizes[ii] = 34+(ii*2);
	        }

	        Runnable r = new Runnable() {

	            @Override
	            public void run() {
	                // the GUI as seen by the user (without frame)
	                JPanel gui = new JPanel(new BorderLayout());
	                gui.setBorder(new EmptyBorder(2, 3, 2, 3));
	                gui.setBackground(Color.WHITE);

	                ArrayList<BufferedImage> images = new ArrayList<BufferedImage>();
	                Vector<ImageIcon> icons = new Vector<ImageIcon>();
	                for (int ii=0; ii< sizes.length; ii++) {
	                    BufferedImage bi = getImage(
	                            sizes[ii], 
	                            colors[ii%colors.length]);
	                    images.add(bi);
	                    ImageIcon imi = new ImageIcon(bi);
	                    icons.add(imi);
	                }
	                JList list = new JList(icons);
	                list.setVisibleRowCount(6);
	                gui.add(new JScrollPane(list));

	                JFrame f = new JFrame("Icon size usage");
	                f.setIconImages(images);
	                f.add(gui);
	                // Ensures JVM closes after frame(s) closed and
	                // all non-daemon threads are finished
	                f.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
	                // See http://stackoverflow.com/a/7143398/418556 for demo.
	                f.setLocationByPlatform(true);

	                // ensures the frame is the minimum size it needs to be
	                // in order display the components within it
	                f.pack();
	                // should be done last, to avoid flickering, moving,
	                // resizing artifacts.
	                f.setVisible(true);
	            }
	        };
	        // Swing GUIs should be created and updated on the EDT
	        // http://docs.oracle.com/javase/tutorial/uiswing/concurrency/initial.html
	        SwingUtilities.invokeLater(r);
	    }
}
